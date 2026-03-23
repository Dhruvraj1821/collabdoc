import { AuthenticatedWebSocket, safeSend } from './wsServer.js';
import {
  ClientMessage,
  DocStateMessage,
  OpBroadcastMessage,
  AckMessage,
  CursorBroadcastMessage,
} from './messageTypes.js';
import {
  joinRoom,
  leaveRoom,
  getRoomWalker,
  roomExists,
  broadcastToRoom,
} from './roomManager.js';
import { replayDocument } from '../services/snapshotService.js';
import { saveEvent, loadEvents } from '../services/opService.js';
import prisma from '../db/prisma.js';

// ── Main dispatcher ───────────────────────────────────────────────────────────

export async function handleMessage(
  ws: AuthenticatedWebSocket,
  message: ClientMessage
): Promise<void> {
  switch (message.type) {
    case 'join_doc':
      await handleJoinDoc(ws, message.docId);
      break;
    case 'operation':
      await handleOperation(ws, message);
      break;
    case 'cursor':
      handleCursor(ws, message.docId, message.position);
      break;
  }
}

// ── Disconnect ────────────────────────────────────────────────────────────────

export async function handleDisconnect(
  ws: AuthenticatedWebSocket
): Promise<void> {
  const { getUserRooms } = await import('./roomManager.js');
  const docIds = getUserRooms(ws.userId);
  for (const docId of docIds) {
    leaveRoom(docId, ws);
  }
}

// ── join_doc ──────────────────────────────────────────────────────────────────

async function handleJoinDoc(
  ws: AuthenticatedWebSocket,
  docId: string
): Promise<void> {
  try {
    const role = await getUserRole(ws.userId, docId);
    if (!role) {
      safeSend(ws, {
        type: 'error',
        message: 'Document not found or access denied',
        fatal: false,
      });
      return;
    }

    let content: string;
    let frontier: string[];

    if (roomExists(docId)) {
      const walker = getRoomWalker(docId)!;
      content = walker.getContent();
      frontier = walker.getFrontier();
      joinRoom(docId, ws, walker);
    } else {
      const result = await replayDocument(docId);
      content = result.content;
      frontier = result.walker.getFrontier();
      joinRoom(docId, ws, result.walker);
    }

    // Load all events to send to client so it can replay into its own walker
    const events = await loadEvents(docId, 0);

    const docStateMessage = {
      type: 'doc_state' as const,
      docId,
      content,
      frontier,
      role,
      events, // client uses these to build its local EgWalker
    };

    safeSend(ws, docStateMessage);
  } catch (err) {
    console.error('handleJoinDoc error:', err);
    safeSend(ws, {
      type: 'error',
      message: 'Failed to join document',
      fatal: false,
    });
  }
}

// ── operation ─────────────────────────────────────────────────────────────────

async function handleOperation(
  ws: AuthenticatedWebSocket,
  message: Extract<ClientMessage, { type: 'operation' }>
): Promise<void> {
  try {
    const { docId, event } = message;

    const role = await getUserRole(ws.userId, docId);
    if (!role || role === 'VIEWER') {
      safeSend(ws, { type: 'error', message: 'Permission denied', fatal: false });
      return;
    }

    const existing = await prisma.event.findUnique({
      where: { id: event.id },
      select: { id: true },
    });

    if (existing) {
      safeSend(ws, { type: 'ack', eventId: event.id });
      return;
    }

    const walker = getRoomWalker(docId);
    if (!walker) {
      safeSend(ws, { type: 'error', message: 'Document room not found — please rejoin', fatal: false });
      return;
    }

    // Check if all parents are in the walker graph
    // If not, reload all events from DB into the walker
    const missingParent = event.parents.find(
      parentId => !walker['graph']['events'].has(parentId)
    );

    if (missingParent) {
      console.log(`Reloading walker for doc ${docId} — missing parent ${missingParent}`);
      const { loadEvents } = await import('../services/opService.js');
      const allEvents = await loadEvents(docId, 0);
      for (const e of allEvents) {
        if (!e.op || !e.op.type) continue;
        if (!walker['graph']['events'].has(e.id)) {
          walker.applyEvent(e);
        }
      }
    }

    const { transformedOp } = walker.applyEvent(event);

    await saveEvent(event, docId);

    safeSend(ws, { type: 'ack', eventId: event.id });

    if (transformedOp) {
      broadcastToRoom(docId, {
        type: 'op_broadcast',
        docId,
        eventId: event.id,
        transformedOp,
        clientId: event.clientId,
        event,
      }, ws.connectionId);
    }
  } catch (err) {
    console.error('handleOperation error:', err);
    safeSend(ws, { type: 'error', message: 'Failed to process operation', fatal: false });
  }
}

// ── cursor ────────────────────────────────────────────────────────────────────

function handleCursor(
  ws: AuthenticatedWebSocket,
  docId: string,
  position: number
): void {
  const broadcast: CursorBroadcastMessage = {
    type: 'cursor_broadcast',
    docId,
    userId: ws.userId,
    username: ws.username,
    position,
    color: ws.color,
  };
  broadcastToRoom(docId, broadcast, ws.connectionId);
}

// ── RBAC helper ───────────────────────────────────────────────────────────────

async function getUserRole(
  userId: string,
  docId: string
): Promise<'OWNER' | 'EDITOR' | 'VIEWER' | null> {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { ownerId: true },
  });

  if (!doc) return null;
  if (doc.ownerId === userId) return 'OWNER';

  const membership = await prisma.docMember.findUnique({
    where: { userId_documentId: { userId, documentId: docId } },
    select: { role: true },
  });

  return membership?.role ?? null;
}