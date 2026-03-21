import { EgWalker } from '../crdt/egWalker.js';
import { saveSnapshot } from '../services/snapshotService.js';

export async function triggerSnapshot(
  docId: string,
  walker: EgWalker
): Promise<void> {
  try {
    const frontier = walker.getFrontier();
    if (frontier.length === 0) return;

    // Only use real event IDs — skip synthetic snapshot_ IDs
    // Synthetic IDs are not in the Event table and cause FK violations
    const realFrontier = frontier.filter(id => !id.startsWith('snapshot_'));
    if (realFrontier.length === 0) return;

    const content = walker.getContent();
    await saveSnapshot(docId, content, realFrontier[0]);
    console.log(`Snapshot saved for document ${docId}`);
  } catch (err) {
    console.error(`Failed to save snapshot for ${docId}:`, err);
  }
}