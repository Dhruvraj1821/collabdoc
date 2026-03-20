import type { EgEvent, EventId } from '../types/crdt.js';

// ── Line/column to flat offset ────────────────────────────────────────────────

export function monacoPositionToOffset(
  content: string,
  lineNumber: number,
  column: number
): number {
  const lines = content.split('\n');
  let offset = 0;

  for (let i = 0; i < lineNumber - 1; i++) {
    offset += lines[i].length + 1; // +1 for \n
  }

  offset += column - 1; // column is 1-based

  return offset;
}

// ── Generate unique event ID ──────────────────────────────────────────────────

export function generateEventId(clientId: string): string {
  return `${clientId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Convert Monaco change to EgEvents ────────────────────────────────────────

export function convertMonacoChange(
  change: {
    range: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    };
    text: string;
    rangeLength: number;
  },
  currentContent: string,
  currentFrontier: EventId[],
  clientId: string
): EgEvent[] {
  const events: EgEvent[] = [];
  const startOffset = monacoPositionToOffset(
    currentContent,
    change.range.startLineNumber,
    change.range.startColumn
  );

  let currentParents: EventId[] = [...currentFrontier];

  // Step 1 — delete events (one per deleted character)
  for (let i = 0; i < change.rangeLength; i++) {
    const eventId = generateEventId(clientId);
    events.push({
      id: eventId,
      clientId,
      parents: currentParents,
      op: { type: 'delete', index: startOffset },
    });
    currentParents = [eventId];
  }

  // Step 2 — insert events (one per inserted character)
  for (let i = 0; i < change.text.length; i++) {
    const eventId = generateEventId(clientId);
    events.push({
      id: eventId,
      clientId,
      parents: currentParents,
      op: { type: 'insert', index: startOffset + i, char: change.text[i] },
    });
    currentParents = [eventId];
  }

  return events;
}