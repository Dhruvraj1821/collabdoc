// Mirror of server/src/crdt/types.ts
// Kept in sync manually — these are the shared CRDT types

export type EventId = string;
export type ClientId = string;

export interface InsertOp {
  type: 'insert';
  index: number;
  char: string;
}

export interface DeleteOp {
  type: 'delete';
  index: number;
}

export type Op = InsertOp | DeleteOp;

export interface EgEvent {
  id: EventId;
  clientId: ClientId;
  parents: EventId[];
  op: Op;
}

export interface TransformedOp {
  type: 'insert' | 'delete';
  index: number;
  char?: string;
}