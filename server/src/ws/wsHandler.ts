import { WebSocket } from 'ws';
import { AuthenticatedWebSocket, safeSend } from './wsServer.js';
import { ClientMessage } from './messageTypes.js';
import { saveEvent, loadEvents } from '../services/opService.js';
import prisma from '../db/prisma.js';
import type { EgEvent } from '../crdt/types.js';

// ── Simple room registry — docId → set of connections ─────────────────────────
// No walker. No CRDT. Just who is in which room.

const rooms = new Map<string, Set<AuthenticatedWebSocket>>();

function joinRoom(docId: string, ws: AuthenticatedWebSocket): void {
  if (!rooms.has(docId)) rooms.set(docId, new Set());
  rooms.get(docId)!.add(ws);
}

function leaveRoom(docId: string, ws: AuthenticatedWebSocket): void {
  const room = rooms.get(docId);
  if (!room) return;
  room.delete(ws);
  if (room.size === 0) rooms.delete(docId);
}

function broadcastToRoom(
  docId: string,
  message: object,
  excludeConnectionId: string
): void {
  const room = rooms.get(docId);
  if (!room) return;
  for (const ws of room) {
    if (ws.connectionId === excludeConnectionId) continue;
    safeSend(ws, message);
  }
}

function getUserDocIds(userId: string): string[] {
  const docIds: string[] = [];
  for (const [docId, room] of rooms) {
    for (const ws of room) {
      if (ws.userId === userId) {
        docIds.push(docId);
        break;
      }
    }
  }
  return docIds;
}

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
  const docIds = getUserDocIds(ws.userId);
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

    // Add to room
    joinRoom(docId, ws);

    // Load all raw events from DB and send to client
    // Client will replay them through its own EgWalker
    const events = await loadEvents(docId, 0);

    safeSend(ws, {
      type: 'doc_state',
      docId,
      role,
      events, // client replays these — no content computed server-side
    });

    // Broadcast updated presence
    broadcastPresence(docId);
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

    // Check permission
    const role = await getUserRole(ws.userId, docId);
    if (!role || role === 'VIEWER') {
      safeSend(ws, {
        type: 'error',
        message: 'Permission denied',
        fatal: false,
      });
      return;
    }

    // Duplicate guard
    const existing = await prisma.event.findUnique({
      where: { id: event.id },
      select: { id: true },
    });

    if (existing) {
      safeSend(ws, { type: 'ack', eventId: event.id });
      return;
    }

    // Save raw event — no CRDT processing
    await saveEvent(event, docId);

    // Ack to sender
    safeSend(ws, { type: 'ack', eventId: event.id });

    // Relay raw event to all other clients in the room
    // Each client applies it through their own EgWalker
    broadcastToRoom(docId, {
      type: 'op_broadcast',
      docId,
      eventId: event.id,
      event, // raw event — client processes it
    }, ws.connectionId);

  } catch (err) {
    console.error('handleOperation error:', err);
    safeSend(ws, {
      type: 'error',
      message: 'Failed to process operation',
      fatal: false,
    });
  }
}

// ── cursor ────────────────────────────────────────────────────────────────────

function handleCursor(
  ws: AuthenticatedWebSocket,
  docId: string,
  position: number
): void {
  broadcastToRoom(docId, {
    type: 'cursor_broadcast',
    docId,
    userId: ws.userId,
    username: ws.username,
    position,
    color: ws.color,
  }, ws.connectionId);
}

// ── Presence ──────────────────────────────────────────────────────────────────

function broadcastPresence(docId: string): void {
  const room = rooms.get(docId);
  if (!room) return;

  const users = Array.from(room).map(ws => ({
    userId: ws.userId,
    username: ws.username,
    color: ws.color,
  }));

  for (const ws of room) {
    safeSend(ws, { type: 'presence_update', docId, users });
  }
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