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

  // Step 1 — check for a snapshot
  const snapshot = await getLatestSnapshot(docId);

  let afterSequenceNum = 0;

  if (snapshot) {
    // Step 2 — restore the walker to the snapshot state
    // setInitialContent replays the snapshot content as synthetic events
    walker.setInitialContent(snapshot.content);
    afterSequenceNum = snapshot.sequenceNum;
  }

  // Step 3 — load only events after the snapshot (or all events if no snapshot)
  const events = await loadEvents(docId, afterSequenceNum);

  // Step 4 — replay events through the walker
  for (const event of events) {
    walker.applyEvent(event);
  }

  // Step 5 — return both the content string and the live walker
  // The WebSocket handler needs the walker to apply future events
  return {
    content: walker.getContent(),
    walker,
  };
}