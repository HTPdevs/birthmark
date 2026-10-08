import { useEffect, useState, useSyncExternalStore } from 'react';

import { SessionController } from '../domain/sessionController';
import type { ClockSnapshot } from '../domain/types';
import { deviceClock } from '../platform/clock';
import { getDatabase } from '../platform/database';
import { deleteCachedFile } from '../platform/exportPdf';
import type { Db } from '../storage/db';
import * as repo from '../storage/repository';
import { randomUUID } from 'expo-crypto';

export type AppState = {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  active: SessionController | null;
  sessions: repo.SessionSummary[];
  /** Large-clock display preference. Reports always use 24-hour time. */
  clockFormat: '24h' | '12h';
};

class AppStore {
  private state: AppState = { status: 'loading', error: null, active: null, sessions: [], clockFormat: '24h' };
  private listeners = new Set<() => void>();
  private controllers = new Map<string, SessionController>();
  private db: Db | null = null;
  private initializing: Promise<void> | null = null;
  private launchRecoveryPending = false;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getState = () => this.state;

  private set(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private deps(db: Db) {
    return { db, clock: deviceClock, uuid: randomUUID };
  }

  /** Opens storage and restores any active session from the database. */
  init(): Promise<void> {
    if (!this.initializing) {
      this.initializing = (async () => {
        try {
          const db = await getDatabase();
          this.db = db;
          const activeId = await repo.getActiveSessionId(db);
          const active = activeId ? await SessionController.load(this.deps(db), activeId) : null;
          if (active) this.controllers.set(active.sessionId, active);
          this.launchRecoveryPending = !!active;
          const clockFormat = (await repo.getPref(db, 'clockFormat')) === '12h' ? '12h' : '24h';
          this.set({ status: 'ready', active, sessions: await repo.listSessions(db), clockFormat });
        } catch (e) {
          this.initializing = null;
          this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
        }
      })();
    }
    return this.initializing;
  }

  private requireDb(): Db {
    if (!this.db) throw new Error('Storage is not ready.');
    return this.db;
  }

  /** True once per launch if an active session was recovered. */
  consumeLaunchRecovery(): boolean {
    const pending = this.launchRecoveryPending;
    this.launchRecoveryPending = false;
    return pending;
  }

  toggleClockFormat() {
    const clockFormat = this.state.clockFormat === '24h' ? '12h' : '24h';
    this.set({ clockFormat });
    if (this.db) void repo.setPref(this.db, 'clockFormat', clockFormat).catch(() => {});
  }

  async refreshSessions() {
    this.set({ sessions: await repo.listSessions(this.requireDb()) });
  }

  async startSession(): Promise<SessionController> {
    const c = await SessionController.start(this.deps(this.requireDb()));
    this.controllers.set(c.sessionId, c);
    this.set({ active: c });
    await this.refreshSessions();
    return c;
  }

  async getController(sessionId: string): Promise<SessionController | null> {
    const cached = this.controllers.get(sessionId);
    if (cached) return cached;
    const c = await SessionController.load(this.deps(this.requireDb()), sessionId);
    if (c) this.controllers.set(sessionId, c);
    return c;
  }

  /** Resolves once the finish transaction commits. */
  async finishActive(): Promise<string> {
    const c = this.state.active;
    if (!c) throw new Error('No active session.');
    await c.finish();
    this.set({ active: null });
    await this.refreshSessions();
    return c.sessionId;
  }

  async resume(sessionId: string): Promise<void> {
    const c = await this.getController(sessionId);
    if (!c) throw new Error('Session not found.');
    await c.resume();
    this.set({ active: c });
    await this.refreshSessions();
  }

  async deleteSession(sessionId: string): Promise<void> {
    const db = this.requireDb();
    // Let queued writes (e.g. a just-recorded export) land so their files are known.
    await this.controllers.get(sessionId)?.whenSaved();
    const data = await repo.loadSessionData(db, sessionId);
    if (!data) return;
    if (data.session.status !== 'finished') throw new Error('Only completed sessions can be deleted.');
    await repo.deleteSession(db, sessionId);
    data.exports.forEach((e) => e.cachedFilePath && deleteCachedFile(e.cachedFilePath));
    this.controllers.delete(sessionId);
    await this.refreshSessions();
  }
}

export const appStore = new AppStore();

export function useAppState(): AppState {
  return useSyncExternalStore(appStore.subscribe, appStore.getState);
}

export function useControllerState(c: SessionController) {
  return useSyncExternalStore(c.subscribe, c.getState);
}

/**
 * Display refresh only (~4 Hz). Values are recomputed from the clock anchor on
 * every tick; nothing is ever accumulated here.
 */
export function useClockTick(intervalMs = 250): ClockSnapshot {
  const [snapshot, setSnapshot] = useState(() => deviceClock.read());
  useEffect(() => {
    const id = setInterval(() => setSnapshot(deviceClock.read()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return snapshot;
}
