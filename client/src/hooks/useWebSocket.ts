import { useEffect, useRef, useState } from 'react';
import type { EgEvent } from '../crdt/types.js';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface PresenceUser {
  userId: string;
  username: string;
  color: string;
}

export function useWebSocket(
  docId: string | undefined,
  onDocState: (events: EgEvent[]) => void,
  onRemoteOp: (event: EgEvent) => void,
  onPresence: (users: PresenceUser[]) => void
) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  const wsRef = useRef<WebSocket | null>(null);
  const pendingQueue = useRef<EgEvent[]>([]);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectingRef = useRef(false);
  const waitingForAck = useRef(false);

  const docIdRef = useRef(docId);
  const onDocStateRef = useRef(onDocState);
  const onRemoteOpRef = useRef(onRemoteOp);
  const onPresenceRef = useRef(onPresence);

  useEffect(() => { docIdRef.current = docId; }, [docId]);
  useEffect(() => { onDocStateRef.current = onDocState; }, [onDocState]);
  useEffect(() => { onRemoteOpRef.current = onRemoteOp; }, [onRemoteOp]);
  useEffect(() => { onPresenceRef.current = onPresence; }, [onPresence]);

  // ── Send operation with ack-based queue ───────────────────────────────────
  // This is Strategy A — we wait for ack before sending next event.
  // Prevents parent-not-found race conditions on the server.

  function sendOperation(event: EgEvent) {
    if (waitingForAck.current) {
      pendingQueue.current.push(event);
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      waitingForAck.current = true;
      wsRef.current.send(JSON.stringify({
        type: 'operation',
        docId: docIdRef.current,
        event,
      }));
    } else {
      pendingQueue.current.push(event);
    }
  }

  function sendNextFromQueue() {
    if (pendingQueue.current.length === 0) {
      waitingForAck.current = false;
      return;
    }

    const next = pendingQueue.current.shift()!;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      waitingForAck.current = true;
      wsRef.current.send(JSON.stringify({
        type: 'operation',
        docId: docIdRef.current,
        event: next,
      }));
    } else {
      pendingQueue.current.unshift(next);
      waitingForAck.current = false;
    }
  }

  function sendCursor(position: number) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'cursor',
        docId: docIdRef.current,
        position,
      }));
    }
  }

  function drainQueue() {
    waitingForAck.current = false;
    sendNextFromQueue();
  }

  // ── Handle incoming messages ──────────────────────────────────────────────

  function handleMessage(message: any) {
    switch (message.type) {
      case 'doc_state': {
        onDocStateRef.current(message.events ?? []);
        // Drain any pending events that were queued before doc_state arrived
        drainQueue();
        break;
      }

      case 'op_broadcast': {
        onRemoteOpRef.current(message.event);
        break;
      }

      case 'presence_update': {
        onPresenceRef.current(message.users);
        break;
      }

      case 'ack': {
        sendNextFromQueue();
        break;
      }

      case 'error': {
        console.error('WS error from server:', message.message);
        if (message.fatal) wsRef.current?.close();
        break;
      }
    }
  }

  // ── Reconnect ─────────────────────────────────────────────────────────────

  function scheduleReconnect() {
    if (reconnectAttempt.current >= 5) {
      setConnectionState('disconnected');
      return;
    }
    reconnectAttempt.current++;
    setConnectionState('reconnecting');
    const delay = Math.min(
      1000 * Math.pow(2, reconnectAttempt.current) + Math.random() * 500,
      30000
    );
    reconnectTimer.current = setTimeout(connect, delay);
  }

  // ── Connect ───────────────────────────────────────────────────────────────

  function connect() {
    const currentDocId = docIdRef.current;
    if (!currentDocId) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    if (isConnectingRef.current) return;
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING ||
      wsRef.current?.readyState === WebSocket.CLOSING
    ) return;

    isConnectingRef.current = true;

    const wsUrl = `${import.meta.env.VITE_WS_URL}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setConnectionState('connecting');

    ws.onopen = () => {
      isConnectingRef.current = false;
      reconnectAttempt.current = 0;
      setConnectionState('connected');
      ws.send(JSON.stringify({ type: 'join_doc', docId: currentDocId }));
    };

    ws.onmessage = (ev) => {
      try {
        handleMessage(JSON.parse(ev.data));
      } catch {
        console.error('Failed to parse WS message');
      }
    };

    ws.onclose = () => {
      isConnectingRef.current = false;
      setConnectionState('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => {
      isConnectingRef.current = false;
      console.error('WebSocket error');
    };
  }

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
      isConnectingRef.current = false;
    };
  }, []);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    sendOperation,
    sendCursor,
  };
}