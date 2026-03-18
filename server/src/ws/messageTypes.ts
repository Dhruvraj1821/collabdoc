import { z } from 'zod';
import { TransformedOp } from '../crdt/types.js';

export const JoinDocSchema = z.object({
  type: z.literal('join_doc'),
  docId: z.string().min(1),
});

export const OperationSchema = z.object({
  type: z.literal('operation'),
  docId: z.string().min(1),
  event: z.object({
    id: z.string().min(1),
    clientId: z.string().min(1),
    parents: z.array(z.string()),
    op: z.discriminatedUnion('type', [
      z.object({ type: z.literal('insert'), index: z.number().int().min(0), char: z.string().length(1) }),
      z.object({ type: z.literal('delete'), index: z.number().int().min(0) }),
    ]),
  }),
});

export const CursorSchema = z.object({
  type: z.literal('cursor'),
  docId: z.string().min(1),
  position: z.number().int().min(0),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  JoinDocSchema,
  OperationSchema,
  CursorSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type JoinDocMessage = z.infer<typeof JoinDocSchema>;
export type OperationMessage = z.infer<typeof OperationSchema>;

export interface DocStateMessage {
  type: 'doc_state';
  docId: string;
  content: string;
  frontier: string[];
  role: 'OWNER' | 'EDITOR' | 'VIEWER';
}

export interface OpBroadcastMessage {
  type: 'op_broadcast';
  docId: string;
  eventId: string;
  transformedOp: TransformedOp;
  clientId: string;
}

export interface PresenceUpdateMessage {
  type: 'presence_update';
  docId: string;
  users: { userId: string; username: string; color: string }[];
}

export interface CursorBroadcastMessage {
  type: 'cursor_broadcast';
  docId: string;
  userId: string;
  username: string;
  position: number;
  color: string;
}

export interface AckMessage {
  type: 'ack';
  eventId: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
  fatal: boolean;
}