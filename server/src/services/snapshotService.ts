import prisma from '../db/prisma.js';
import { EgWalker } from '../crdt/egWalker.js';
import { loadEvents } from './opService.js';

export async function saveSnapshot(
  docId: string,
  content: string,
  snapshotAfterEventId: string
): Promise<void> {
  await prisma.snapshot.create({
    data: {
      content,
      documentId: docId,
      snapshotAfterEventId,
    },
  });
}

export async function getLatestSnapshot(docId: string): Promise<{
  content: string;
  snapshotAfterEventId: string;
  sequenceNum: number;
} | null> {
  const snapshot = await prisma.snapshot.findFirst({
    where: { documentId: docId },
    orderBy: { createdAt: 'desc' },
    // Join with the Event table to get the sequenceNum of the snapshot event
    // so we know which events to load after it
    include: {
      snapshotAfterEvent: {
        select: { sequenceNum: true },
      },
    },
  });

  if (!snapshot) return null;

  return {
    content: snapshot.content,
    snapshotAfterEventId: snapshot.snapshotAfterEventId,
    sequenceNum: snapshot.snapshotAfterEvent.sequenceNum,
  };
}

export async function replayDocument(docId: string): Promise<{
  content: string;
  walker: EgWalker;
}> {
  const walker = new EgWalker();
  const snapshot = await getLatestSnapshot(docId);
  let afterSequenceNum = 0;

  if (snapshot) {
    walker.setInitialContent(snapshot.content);
    afterSequenceNum = snapshot.sequenceNum;
  }

  const events = await loadEvents(docId, afterSequenceNum);

  for (const event of events) {
    // Guard — skip malformed events from old test data
    if (!event.op || !event.op.type) {
      console.warn(`Skipping malformed event ${event.id}`);
      continue;
    }
    walker.applyEvent(event);
  }

  return { content: walker.getContent(), walker };
}