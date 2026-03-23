import { EventGraph } from './eventGraph.js';
import { CRDTSequence } from './crdtSequence.js';
import {
  EffectState,
  PS_INS,
  PS_NOT_INSERTED,
} from './types.js';

import type {
  EgEvent,
  EventId,
  TransformedOp,
} from './types.js';

export class EgWalker {
  private graph: EventGraph;
  private seq: CRDTSequence;
  private prepareVersion: EventId[];
  private effectVersion: EventId[];
  private deleteTargets: Map<EventId, EventId> = new Map();

  constructor() {
    this.graph = new EventGraph();
    this.seq = new CRDTSequence();
    this.prepareVersion = [];
    this.effectVersion = [];
  }

  applyEvent(event: EgEvent): { transformedOp: TransformedOp | null } {
    this.graph.addEvent(event);

    const { toRetreat, toAdvance } = this.graph.diff(
      this.prepareVersion,
      event.parents
    );

    const retreatOrdered = this.graph
        .topologicalSort(new Set(toRetreat))
        .reverse();

    for (const eventId of retreatOrdered) {
        const e = this.graph.getEvent(eventId);
        if(!e) {
          console.warn(`retreat: event ${eventId} not found in graph - skipping`);
          continue;
        }
        const targetId = e.op.type === 'delete'
            ? this.deleteTargets.get(eventId)!
            : eventId;
        this.seq.retreat(targetId, e.op.type);
    }

    const advanceOrdered = this.graph.topologicalSort(new Set(toAdvance));

    for (const eventId of advanceOrdered) {
        const e = this.graph.getEvent(eventId);
        if(!e){
          console.warn(`advance: event ${eventId} not found in graph - skipping`);
          continue;
        }
        const targetId = e.op.type === 'delete'
            ? this.deleteTargets.get(eventId)!
            : eventId;
        this.seq.advance(targetId, e.op.type);
    }

    let transformedOp: TransformedOp | null = null;

    if (event.op.type === 'insert') {
      transformedOp = this.applyInsert(event);
    } else {
      transformedOp = this.applyDelete(event);
    }

    this.prepareVersion = [event.id];
    this.effectVersion = [event.id];

    //this.checkAndClearState();

    return { transformedOp };
  }

  private applyInsert(event: EgEvent): TransformedOp {
    const op = event.op;
    if (op.type !== 'insert') throw new Error('Expected insert op');

    const records = this.seq.getRecords();
    const prepareVisible = records.filter(r => r.sp >= PS_INS);

    const originLeft =
      op.index === 0
        ? null
        : prepareVisible[op.index - 1]?.eventId ?? null;

    const originRight =
      op.index >= prepareVisible.length
        ? null
        : prepareVisible[op.index]?.eventId ?? null;

    const newRecord = {
      eventId: event.id,
      char: op.char,
      sp: PS_INS,
      se: EffectState.Ins,
      originLeft,
      originRight,
    };

    this.seq.integrate(newRecord);

    const allRecords = this.seq.getRecords();
    const insertedIdx = allRecords.findIndex(r => r.eventId === event.id);
    const transformedIndex = this.seq.getEffectIndex(insertedIdx);

    return {
      type: 'insert',
      index: transformedIndex,
      char: op.char,
    };
  }

  private applyDelete(event: EgEvent): TransformedOp | null {
    const op = event.op;
    if (op.type !== 'delete') throw new Error('Expected delete op');

    const recordIdx = this.seq.findByPrepareIndex(op.index);
    const record = this.seq.getRecords()[recordIdx];

    this.deleteTargets.set(event.id, record.eventId);

    record.sp = record.sp + 1;

    if (record.se === EffectState.Del) {
      return null;
    }

    record.se = EffectState.Del;

    const transformedIndex = this.seq.getEffectIndex(recordIdx);

    return {
      type: 'delete',
      index: transformedIndex,
    };
  }

  private checkAndClearState(): void {
    if (this.graph.isCriticalVersion(this.effectVersion)) {
      this.seq.clearToPlaceholder();
    }
  }

  getContent(): string {
    return this.seq.getContent();
  }

  getFrontier(): EventId[] {
    return this.graph.getFrontier();
  }

  setInitialContent(content: string): void {
    this.seq['records'] = [];
    this.graph['events'] = new Map();
    this.prepareVersion = [];
    this.effectVersion = [];

    for (let i = 0; i < content.length; i++) {
      const eventId = `snapshot_${i}`;
      const event: EgEvent = {
        id: eventId,
        clientId: 'snapshot',
        parents: i === 0 ? [] : [`snapshot_${i - 1}`],
        op: { type: 'insert', index: i, char: content[i] },
      };
      this.applyEvent(event);
    }
  }
}