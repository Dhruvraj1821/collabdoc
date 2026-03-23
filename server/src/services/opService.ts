import prisma from '../db/prisma.js';
import type { EgEvent } from '../crdt/types.js';

// Per-document serial queue — prevents sequenceNum race conditions
// when multiple connections type simultaneously
const docQueues = new Map<string, Promise<void>>();

function getDocQueue(docId: string): Promise<void> {
  return docQueues.get(docId) ?? Promise.resolve();
}

function setDocQueue(docId: string, p: Promise<void>): void {
  docQueues.set(docId, p);
  // Clean up after completion so map doesn't grow forever
  p.finally(() => {
    if (docQueues.get(docId) === p) {
      docQueues.delete(docId);
    }
  });
}

export async function saveEvent(
  event: EgEvent,
  docId: string
): Promise<void> {
  // Chain this save onto the existing queue for this document
  // Ensures events for the same document are saved one at a time
  const queue = getDocQueue(docId);
  const next = queue.then(() => doSaveEvent(event, docId));
  setDocQueue(docId, next.then(() => {}, () => {}));
  await next;
}

async function doSaveEvent(event: EgEvent, docId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const latest = await tx.event.findFirst({
      where: { documentId: docId },
      orderBy: { sequenceNum: 'desc' },
      select: { sequenceNum: true },
    });

    const nextSeq = (latest?.sequenceNum ?? 0) + 1;

    await tx.event.create({
      data: {
        id: event.id,
        clientId: event.clientId,
        parentsJson: JSON.stringify(event.parents),
        op: event.op as object,
        sequenceNum: nextSeq,
        documentId: docId,
      },
    });
  });
}

export async function loadEvents(
  docId: string,
  afterSequenceNum = 0
): Promise<EgEvent[]> {
  const rows = await prisma.event.findMany({
    where: {
      documentId: docId,
      sequenceNum: { gt: afterSequenceNum },
    },
    orderBy: { sequenceNum: 'asc' },
  });

  return rows.map(row => ({
    id: row.id,
    clientId: row.clientId,
    parents: JSON.parse(row.parentsJson) as string[],
    op: row.op as unknown as EgEvent['op'],
  }));
}