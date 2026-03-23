import {
  EffectState,
  PS_NOT_INSERTED,
  PS_INS,
} from './types.js';

import type {
  CRDTRecord,
  EventId,
} from './types.js';

export class CRDTSequence {
  private records: CRDTRecord[] = [];

  getContent(): string {
    return this.records
      .filter(r => r.se === EffectState.Ins)
      .map(r => r.char)
      .join('');
  }

  getRecords(): CRDTRecord[] {
    return [...this.records];
  }

  findByPrepareIndex(i: number): number {
    let count = 0;
    for (let idx = 0; idx < this.records.length; idx++) {
      if (this.records[idx].sp >= PS_INS) {
        if (count === i) return idx;
        count++;
      }
    }
    throw new Error(`Prepare index ${i} out of bounds (count=${count})`);
  }

  getEffectIndex(upTo: number): number {
    let count = 0;
    for (let i = 0; i < upTo; i++) {
      if (this.records[i].se === EffectState.Ins) count++;
    }
    return count;
  }

  retreat(eventId: EventId, opType: 'insert' | 'delete'): void {
    const idx = this.records.findIndex(r => r.eventId === eventId);
    if (idx === -1) throw new Error(`retreat: eventId ${eventId} not found`);

    const record = this.records[idx];

    if (opType === 'insert') {
      record.sp = PS_NOT_INSERTED;
    } else {
      record.sp = record.sp - 1;
    }
  }

  advance(eventId: EventId, opType: 'insert' | 'delete'): void {
    const idx = this.records.findIndex(r => r.eventId === eventId);
    if (idx === -1) throw new Error(`advance: eventId ${eventId} not found`);

    const record = this.records[idx];

    if (opType === 'insert') {
      record.sp = PS_INS;
    } else {
      record.sp = record.sp + 1;
    }
  }

  integrate(newRecord: CRDTRecord): void {
    const records = this.records;

    let leftIdx = -1;
    if (newRecord.originLeft !== null) {
      leftIdx = records.findIndex(r => r.eventId === newRecord.originLeft);
      if (leftIdx === -1) {
        throw new Error(`integrate: originLeft ${newRecord.originLeft} not found`);
      }
    }

    let rightIdx = records.length;
    if (newRecord.originRight !== null) {
      rightIdx = records.findIndex(r => r.eventId === newRecord.originRight);
      if (rightIdx === -1) {
        throw new Error(`integrate: originRight ${newRecord.originRight} not found`);
      }
    }

    let insertPos = leftIdx + 1;

    for (let i = leftIdx + 1; i < rightIdx; i++) {
      const existing = records[i];

      if (existing.originLeft !== newRecord.originLeft) {
        break;
      }

      if (existing.eventId < newRecord.eventId) {
        insertPos = i + 1;
      } else {
        break;
      }
    }

    records.splice(insertPos, 0, newRecord);
  }

  clearToPlaceholder(): void {
    const visibleCount = this.records.filter(
      r => r.se === EffectState.Ins
    ).length;

    if (visibleCount === 0) {
      this.records = [];
      return;
    }

    this.records = [{
      eventId: 'placeholder',
      char: '_',
      sp: PS_INS,
      se: EffectState.Ins,
      originLeft: null,
      originRight: null,
    }];
  }
}