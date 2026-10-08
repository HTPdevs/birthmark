import type { Db } from './db';

export type WriteOp = {
  /** Stable id so a retried op is recognisable; ops themselves must be idempotent. */
  id: string;
  /** Record ids this op makes durable; reported as saved once it commits. */
  recordIds: string[];
  run: (db: Db) => Promise<void>;
};

export type QueueStatus = {
  pending: number;
  failed: boolean;
  lastError: string | null;
};

type Listener = (status: QueueStatus, savedRecordIds: string[]) => void;

/**
 * Serializes every mutation. A failed op stays at the head of the queue (later
 * ops wait behind it so writes never land out of order) until retry() succeeds.
 * Callers never await persistence before updating the screen: captures are
 * recorded in memory first and shown as pending until their op commits.
 */
export class WriteQueue {
  private queue: { op: WriteOp; resolve: () => void }[] = [];
  private running = false;
  private failed = false;
  private lastError: string | null = null;
  private listeners = new Set<Listener>();
  private idleWaiters: (() => void)[] = [];

  constructor(private db: Db) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  status(): QueueStatus {
    return { pending: this.queue.length, failed: this.failed, lastError: this.lastError };
  }

  /** Resolves once this op commits. Never rejects: a failed op waits for retry(). */
  enqueue(op: WriteOp): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push({ op, resolve });
      this.emit([]);
      void this.drain();
    });
  }

  retry(): void {
    if (!this.failed) return;
    this.failed = false;
    this.lastError = null;
    this.emit([]);
    void this.drain();
  }

  /** Resolves when the queue is empty or halted on a failure. */
  whenIdle(): Promise<void> {
    if (!this.running && (this.queue.length === 0 || this.failed)) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private emit(saved: string[]) {
    const s = this.status();
    this.listeners.forEach((l) => l(s, saved));
  }

  private async drain(): Promise<void> {
    if (this.running || this.failed) return;
    this.running = true;
    try {
      while (this.queue.length && !this.failed) {
        const { op, resolve } = this.queue[0];
        try {
          await op.run(this.db);
          this.queue.shift();
          this.emit(op.recordIds);
          resolve();
        } catch (e) {
          this.failed = true;
          this.lastError = e instanceof Error ? e.message : String(e);
          this.emit([]);
        }
      }
    } finally {
      this.running = false;
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      waiters.forEach((w) => w());
    }
  }
}
