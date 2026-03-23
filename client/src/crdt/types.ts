export type EventId = string;
export type ClientId = string;

export interface InsertOp {
    type: 'insert';
    index: number;
    char: string;
}

export interface DeleteOp{
    type: 'delete';
    index: number
}

export type Op = InsertOp | DeleteOp;

export interface EgEvent {
    id: EventId;
    clientId: ClientId;
    parents: EventId[];
    op: Op;
}

// PrepareState — only ever modified by retreat() and advance()
// Stored as a number for efficiency:
//   0         = NotInsertedYet (record not visible in prepare version)
//   1         = Ins (record visible in prepare version)
//   2,3,4...  = Del(n) (deleted n times, stored as n+1)
export type PrepareState = number;

export const PS_NOT_INSERTED = 0;  //not inserted yet
export const PS_INS = 1; // ins

export function psDelCount(sp: PrepareState): number {
    return sp - 1;
}

export enum EffectState {
    Ins = 'Ins',
    Del = 'Del',
}

// CRDT Record 

export interface CRDTRecord {
    eventId: EventId;
    char: string;
    sp: PrepareState; //prepare state modified by retreat / advance only
    se: EffectState;  // effect state modified by applyEvent only

    originLeft: EventId | null; //eventId of recor immediately to the left when inserted. Null if inserted at 0

    originRight: EventId | null; //eventId of the record immediately to the right . null if inserted at end 
}

export interface TransformedOp {
    type: 'insert' | 'delete';
    index: number;
    char?: string;  //this field is only present for insert
}