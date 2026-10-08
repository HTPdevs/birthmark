import Database from 'better-sqlite3';

import type { BindValue, Db } from '@/storage/db';

export type TestDb = Db & {
  raw: Database.Database;
  /** Makes the next N statements matching the pattern throw, to simulate write failures. */
  failNext(pattern: RegExp, times?: number): void;
};

/**
 * Real SQLite (better-sqlite3) behind the same async surface as expo-sqlite, so
 * repository and controller tests exercise actual constraints and transactions.
 */
export function openTestDb(file = ':memory:'): TestDb {
  const raw = new Database(file);
  const failures: { pattern: RegExp; remaining: number }[] = [];
  const check = (sql: string) => {
    const f = failures.find((x) => x.remaining > 0 && x.pattern.test(sql));
    if (f) {
      f.remaining--;
      throw new Error('SQLITE_FULL: database or disk is full (simulated)');
    }
  };
  let txDepth = 0;
  return {
    raw,
    failNext(pattern, times = 1) {
      failures.push({ pattern, remaining: times });
    },
    async execAsync(source) {
      check(source);
      raw.exec(source);
    },
    async runAsync(source, params: BindValue[]) {
      check(source);
      const r = raw.prepare(source).run(...params);
      return { changes: r.changes };
    },
    async getAllAsync<T>(source: string, params: BindValue[]) {
      const stmt = raw.prepare(source);
      return (stmt.reader ? stmt.all(...params) : []) as T[];
    },
    async getFirstAsync<T>(source: string, params: BindValue[]) {
      const stmt = raw.prepare(source);
      return ((stmt.reader ? stmt.get(...params) : null) ?? null) as T | null;
    },
    async withTransactionAsync(task) {
      if (txDepth > 0) return task();
      txDepth++;
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally {
        txDepth--;
      }
    },
  };
}
