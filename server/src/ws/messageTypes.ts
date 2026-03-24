import { z } from 'zod';
import type { EgEvent } from '../crdt/types.js';

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('join_doc'),
    docId: z.string(),
  }),
  z.object({
    type: z.literal('operation'),
    docId: z.string(),
    event: z.object({
      id: z.string(),
      clientId: z.string(),
      parents: z.array(z.string()),
      op: z.object({
        type: z.enum(['insert', 'delete']),
        index: z.number(),
        char: z.string().optional(),
      }),
    }),
  }),
  z.object({
    type: z.literal('cursor'),
    docId: z.string(),
    position: z.number(),
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export interface DocStateMessage {
  type: 'doc_state';
  docId: string;
  role: string;
  events: EgEvent[];
}

export interface OpBroadcastMessage {
  type: 'op_broadcast';
  docId: string;
  eventId: string;
  event: EgEvent;
}

export interface AckMessage {
  type: 'ack';
  eventId: string;
}

export interface CursorBroadcastMessage {
  type: 'cursor_broadcast';
  docId: string;
  userId: string;
  username: string;
  position: number;
  color: string;
}

export interface PresenceUpdateMessage {
  type: 'presence_update';
  docId: string;
  users: Array<{
    userId: string;
    username: string;
    color: string;
  }>;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  fatal: boolean;
}