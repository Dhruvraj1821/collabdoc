import { EgWalker } from '../crdt/egWalker.js';
import { AuthenticatedWebSocket, safeSend } from './wsServer.js';
import { PresenceUpdateMessage } from './messageTypes.js';

interface Room {
  docId: string;
  // connectionId → ws — allows same user in multiple tabs
  connections: Map<string, AuthenticatedWebSocket>;
  walker: EgWalker;
}

const rooms = new Map<string, Room>();

// ── Join ──────────────────────────────────────────────────────────────────────

export function joinRoom(
  docId: string,
  ws: AuthenticatedWebSocket,
  walker: EgWalker
): void {
  if (!rooms.has(docId)) {
    rooms.set(docId, {
      docId,
      connections: new Map(),
      walker,
    });
  }

  const room = rooms.get(docId)!;

  // Key by connectionId not userId — same user can have multiple tabs open
  room.connections.set(ws.connectionId, ws);

  broadcastPresence(docId);
}

// ── Leave ─────────────────────────────────────────────────────────────────────

export function leaveRoom(
  docId: string,
  ws: AuthenticatedWebSocket
): void {
  const room = rooms.get(docId);
  if (!room) return;

  room.connections.delete(ws.connectionId);

  if (room.connections.size === 0) {
    rooms.delete(docId);
    import('./snapshotTrigger.js').then(({ triggerSnapshot }) => {
      triggerSnapshot(docId, room.walker);
    });
    return;
  }

  broadcastPresence(docId);
}

// ── Get walker ────────────────────────────────────────────────────────────────

export function getRoomWalker(docId: string): EgWalker | null {
  return rooms.get(docId)?.walker ?? null;
}

// ── Check if room exists ──────────────────────────────────────────────────────

export function roomExists(docId: string): boolean {
  return rooms.has(docId);
}

// ── Broadcast to room ─────────────────────────────────────────────────────────

export function broadcastToRoom(
  docId: string,
  message: object,
  excludeConnectionId?: string
): void {
  const room = rooms.get(docId);
  if (!room) return;

  for (const [connectionId, ws] of room.connections) {
    if (connectionId === excludeConnectionId) continue;
    safeSend(ws, message);
  }
}

// ── Broadcast presence ────────────────────────────────────────────────────────

function broadcastPresence(docId: string): void {
  const room = rooms.get(docId);
  if (!room) return;

  // Deduplicate users — same user in multiple tabs shows once
  const userMap = new Map<string, { userId: string; username: string; color: string }>();
  for (const ws of room.connections.values()) {
    userMap.set(ws.userId, {
      userId: ws.userId,
      username: ws.username,
      color: ws.color,
    });
  }

  const message: PresenceUpdateMessage = {
    type: 'presence_update',
    docId,
    users: Array.from(userMap.values()),
  };

  broadcastToRoom(docId, message);
}

// ── Get all docIds a user is in ───────────────────────────────────────────────

export function getUserRooms(userId: string): string[] {
  const docIds: string[] = [];
  for (const [docId, room] of rooms) {
    for (const ws of room.connections.values()) {
      if (ws.userId === userId) {
        docIds.push(docId);
        break;
      }
    }
  }
  return docIds;
}