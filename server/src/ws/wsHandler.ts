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
import { saveEvent } from '../services/opService.js';
import prisma from '../db/prisma.js';

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

export async function handleDisconnect(
  ws: AuthenticatedWebSocket
): Promise<void> {
  const { getUserRooms } = await import('./roomManager.js');
  const docIds = getUserRooms(ws.userId);

  for (const docId of docIds) {
    leaveRoom(docId, ws);
  }
}

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
      // Room already exists — MUST use the in-memory walker
      // Do NOT call replayDocument here — it creates a separate walker
      // that doesn't share state with the existing room
      const walker = getRoomWalker(docId)!;
      content = walker.getContent();
      frontier = walker.getFrontier();
      // Add this connection to the existing room
      joinRoom(docId, ws, walker);
    } else {
      // Fresh room — load from database
      const result = await replayDocument(docId);
      content = result.content;
      frontier = result.walker.getFrontier();
      // Create the room with this walker
      joinRoom(docId, ws, result.walker);
    }

    const docStateMessage: DocStateMessage = {
      type: 'doc_state',
      docId,
      content,
      frontier,
      role,
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

async function handleOperation(
  ws: AuthenticatedWebSocket,
  message: Extract<ClientMessage, { type: 'operation' }>
): Promise<void> {
  try {
    const { docId, event } = message;

    const role = await getUserRole(ws.userId, docId);
    if (!role || role === 'VIEWER') {
      safeSend(ws, {
        type: 'error',
        message: 'You do not have permission to edit this document',
        fatal: false,
      });
      return;
    }

    const existing = await prisma.event.findUnique({
      where: { id: event.id },
      select: { id: true },
    });

    if (existing) {
      const ack: AckMessage = { type: 'ack', eventId: event.id };
      safeSend(ws, ack);
      return;
    }

    const walker = getRoomWalker(docId);
    if (!walker) {
      safeSend(ws, {
        type: 'error',
        message: 'Document room not found — please rejoin',
        fatal: false,
      });
      return;
    }

    const { transformedOp } = walker.applyEvent(event);

    await saveEvent(event, docId);

    const ack: AckMessage = { type: 'ack', eventId: event.id };
    safeSend(ws, ack);

    if (transformedOp) {
      const broadcast: OpBroadcastMessage = {
        type: 'op_broadcast',
        docId,
        eventId: event.id,
        transformedOp,
        clientId: event.clientId,
      };
      broadcastToRoom(docId, broadcast, ws.connectionId);
    }
  } catch (err) {
    console.error('handleOperation error:', err);
    safeSend(ws, {
      type: 'error',
      message: 'Failed to process operation',
      fatal: false,
    });
  }
}

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