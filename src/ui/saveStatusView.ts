import type { QueueStatus } from '../storage/writeQueue';

/** What the save-status slot shows. */
export type SaveStatusView = 'failed' | 'saving' | 'history';

/**
 * Picks the save-status slot from the write queue. A failed write always wins,
 * so it is never hidden; any queued write shows "Saving". Only an empty, healthy
 * queue frees the slot for the History button, which makes no "saved" claim.
 */
export function saveStatusView(queue: Pick<QueueStatus, 'pending' | 'failed'>): SaveStatusView {
  if (queue.failed) return 'failed';
  if (queue.pending > 0) return 'saving';
  return 'history';
}
