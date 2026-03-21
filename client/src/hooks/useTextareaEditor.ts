import type { EgEvent, EventId } from '../types/crdt.js';

// ── Generate a unique event ID ────────────────────────────────────────────────

export function generateEventId(clientId: string): string {
  return `${clientId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Diff two strings to produce insert/delete events ─────────────────────────
// This is simpler and more reliable than Monaco's change events.
// We compare old content vs new content and find what changed.

export function diffContent(
  oldContent: string,
  newContent: string,
  currentFrontier: EventId[],
  clientId: string
): EgEvent[] {
  const events: EgEvent[] = [];
  let currentParents = [...currentFrontier];

  // Find the first position where strings differ
  let start = 0;
  while (
    start < oldContent.length &&
    start < newContent.length &&
    oldContent[start] === newContent[start]
  ) {
    start++;
  }

  // Find the last position where strings differ (from the end)
  let oldEnd = oldContent.length;
  let newEnd = newContent.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldContent[oldEnd - 1] === newContent[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }

  // Characters from start to oldEnd were deleted
  const deletedCount = oldEnd - start;
  // Characters from start to newEnd were inserted
  const insertedChars = newContent.slice(start, newEnd);

  // Generate delete events first
  for (let i = 0; i < deletedCount; i++) {
    const eventId = generateEventId(clientId);
    events.push({
      id: eventId,
      clientId,
      parents: currentParents,
      op: { type: 'delete', index: start },
    });
    currentParents = [eventId];
  }

  // Generate insert events
  for (let i = 0; i < insertedChars.length; i++) {
    const eventId = generateEventId(clientId);
    events.push({
      id: eventId,
      clientId,
      parents: currentParents,
      op: { type: 'insert', index: start + i, char: insertedChars[i] },
    });
    currentParents = [eventId];
  }

  return events;
}

// ── Apply a remote transformed op to a content string ────────────────────────
// Pure function — takes content string, returns new content string.
// No DOM manipulation needed.

export function applyTransformedOp(
  content: string,
  transformedOp: { type: 'insert' | 'delete'; index: number; char?: string }
): string {
  if (transformedOp.type === 'insert' && transformedOp.char) {
    return (
      content.slice(0, transformedOp.index) +
      transformedOp.char +
      content.slice(transformedOp.index)
    );
  } else if (transformedOp.type === 'delete') {
    return (
      content.slice(0, transformedOp.index) +
      content.slice(transformedOp.index + 1)
    );
  }
  return content;
}