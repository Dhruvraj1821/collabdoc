import prisma from '../db/prisma.js';
import { EgEvent } from '../crdt/types.js';

export async function saveEvent(
  event: EgEvent,
  docId: string
): Promise<void> {
  // Use a transaction to prevent race condition on sequenceNum
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

export async function getNextSequenceNum(docId: string): Promise<number> {
  const latest = await prisma.event.findFirst({
    where: { documentId: docId },
    orderBy: { sequenceNum: 'desc' },
    select: { sequenceNum: true },
  });

  return (latest?.sequenceNum ?? 0) + 1; // if no events till now start at 1
}
// the getNextSequenceNum  has a production hazard - two events within same millisecond can cause race condition . to solve this we need to fix per-document sequencing. using database transaction with a lock

export async function loadEvents(
  docId: string,
  afterSequenceNum = 0  //default 0  to load all events
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
    op: row.op as unknown as  EgEvent['op'], // cast json fields back to Op type (had to do a double cast here as prisma's json type is too broad for typescript)
  }));
}