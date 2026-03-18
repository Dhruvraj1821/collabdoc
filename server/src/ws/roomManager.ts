import { EgWalker } from '../crdt/egWalker.js';
import { AuthenticatedWebSocket, safeSend } from './wsServer.js';
import { PresenceUpdateMessage } from './messageTypes.js';

interface Room {
  docId: string;
  connections: Map<string, AuthenticatedWebSocket>;
  walker: EgWalker;
}

const rooms = new Map<string, Room>();

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
  room.connections.set(ws.userId, ws);
  broadcastPresence(docId);
}

export function leaveRoom(
  docId: string,
  ws: AuthenticatedWebSocket
): void {
  const room = rooms.get(docId);
  if (!room) return;

  room.connections.delete(ws.userId);

  if (room.connections.size === 0) {
    rooms.delete(docId);
    import('./snapshotTrigger.js').then(({ triggerSnapshot }) => {
      triggerSnapshot(docId, room.walker);
    });
    return;
  }

  broadcastPresence(docId);
}

export function getRoomWalker(docId: string): EgWalker | null {
  return rooms.get(docId)?.walker ?? null;
}

export function roomExists(docId: string): boolean {
  return rooms.has(docId);
}

export function broadcastToRoom(
  docId: string,
  message: object,
  excludeUserId?: string
): void {
  const room = rooms.get(docId);
  if (!room) return;

  for (const [userId, ws] of room.connections) {
    if (userId === excludeUserId) continue;
    safeSend(ws, message);
  }
}

function broadcastPresence(docId: string): void {
  const room = rooms.get(docId);
  if (!room) return;

  const users = Array.from(room.connections.values()).map(ws => ({
    userId: ws.userId,
    username: ws.username,
    color: ws.color,
  }));

  const message: PresenceUpdateMessage = {
    type: 'presence_update',
    docId,
    users,
  };

  broadcastToRoom(docId, message);
}

export function getUserRooms(userId: string): string[] {
  const docIds: string[] = [];
  for (const [docId, room] of rooms) {
    if (room.connections.has(userId)) {
      docIds.push(docId);
    }
  }
  return docIds;
}