import { useEffect, useRef, useState } from 'react';
import type { EgEvent, EventId, TransformedOp } from '../types/crdt.js';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface DocStateMessage {
  type: 'doc_state';
  docId: string;
  content: string;
  frontier: EventId[];
  role: string;
}

interface OpBroadcastMessage {
  type: 'op_broadcast';
  docId: string;
  eventId: string;
  transformedOp: TransformedOp;
  clientId: string;
}

interface PresenceUser {
  userId: string;
  username: string;
  color: string;
}

interface PresenceUpdateMessage {
  type: 'presence_update';
  docId: string;
  users: PresenceUser[];
}

interface ErrorMessage {
  type: 'error';
  message: string;
  fatal: boolean;
}

export type { PresenceUser };

export function useWebSocket(
  docId: string | undefined,
  onDocState: (content: string, frontier: EventId[]) => void,
  onRemoteOp: (transformedOp: TransformedOp, eventId: string) => void,
  onPresence: (users: PresenceUser[]) => void
) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  const wsRef = useRef<WebSocket | null>(null);
  const pendingQueue = useRef<EgEvent[]>([]);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const docIdRef = useRef(docId);
  const onDocStateRef = useRef(onDocState);
  const onRemoteOpRef = useRef(onRemoteOp);
  const onPresenceRef = useRef(onPresence);

  useEffect(() => { docIdRef.current = docId; }, [docId]);
  useEffect(() => { onDocStateRef.current = onDocState; }, [onDocState]);
  useEffect(() => { onRemoteOpRef.current = onRemoteOp; }, [onRemoteOp]);
  useEffect(() => { onPresenceRef.current = onPresence; }, [onPresence]);

  // ── Send operation ────────────────────────────────────────────────────────

  function sendOperation(event: EgEvent) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'operation',
        docId: docIdRef.current,
        event,
      }));
    } else {
      pendingQueue.current.push(event);
    }
  }

  // ── Send cursor ───────────────────────────────────────────────────────────

  function sendCursor(position: number) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'cursor',
        docId: docIdRef.current,
        position,
      }));
    }
  }

  // ── Drain pending queue ───────────────────────────────────────────────────

  function drainQueue(serverFrontier: EventId[]) {
    if (pendingQueue.current.length === 0) return;
    const queue = [...pendingQueue.current];
    pendingQueue.current = [];

    if (queue.length > 0) {
      queue[0] = { ...queue[0], parents: serverFrontier };
    }

    for (const event of queue) {
      wsRef.current?.send(JSON.stringify({
        type: 'operation',
        docId: docIdRef.current,
        event,
      }));
    }
  }

  // ── Handle incoming messages ──────────────────────────────────────────────

  function handleMessage(message: any) {
    switch (message.type) {
      case 'doc_state': {
        const msg = message as DocStateMessage;
        onDocStateRef.current(msg.content, msg.frontier);
        drainQueue(msg.frontier);
        break;
      }

      case 'op_broadcast': {
        const msg = message as OpBroadcastMessage;
        onRemoteOpRef.current(msg.transformedOp, msg.eventId);
        break;
      }

      case 'presence_update': {
        const msg = message as PresenceUpdateMessage;
        onPresenceRef.current(msg.users);
        break;
      }

      case 'ack':
        break;

      case 'error': {
        const msg = message as ErrorMessage;
        console.error('WS error from server:', msg.message);
        if (msg.fatal) wsRef.current?.close();
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

    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) return;

    const wsUrl = `${import.meta.env.VITE_WS_URL}?token=${token}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setConnectionState('connecting');

    ws.onopen = () => {
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
      setConnectionState('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => {
      console.error('WebSocket error');
    };
  }

  // ── Mount / unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    sendOperation,
    sendCursor,
  };
}