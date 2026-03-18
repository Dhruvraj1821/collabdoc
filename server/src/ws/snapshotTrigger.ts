import { EgWalker } from '../crdt/egWalker.js';
import { saveSnapshot } from '../services/snapshotService.js';

export async function triggerSnapshot(
  docId: string,
  walker: EgWalker
): Promise<void> {
  try {
    const frontier = walker.getFrontier();

    if (frontier.length === 0) return;

    const content = walker.getContent();
    const snapshotAfterEventId = frontier[0];

    await saveSnapshot(docId, content, snapshotAfterEventId);
    console.log(`Snapshot saved for document ${docId}`);
  } catch (err) {
    console.error(`Failed to save snapshot for ${docId}:`, err);
  }
}