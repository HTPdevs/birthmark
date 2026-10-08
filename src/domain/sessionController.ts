import { SCHEMA_VERSION, type Db } from '../storage/db';
import * as repo from '../storage/repository';
import { type QueueStatus, WriteQueue } from '../storage/writeQueue';
import { type ManualTimeInput, resolveManualTime } from './manualTime';
import {
  anchorFromSnapshot,
  checkpointFromSnapshot,
  computeElapsed,
  detectClockChanges,
  resolveAnchor,
} from './time';
import { effectiveElapsed, type RowMode, deriveRowMode } from './timeline';
import {
  type Assessment,
  type AssessmentPoint,
  type Checkpoint,
  type ClockSnapshot,
  type ElapsedMs,
  type ExportRecord,
  LABEL_MAX_LENGTH,
  type MilestoneCode,
  type Moment,
  type Revision,
  type RevisionAction,
  type Session,
  type SessionData,
  type SessionEvent,
  type TimingFlag,
  type WallMs,
  elapsedMs,
} from './types';

export type Clock = { read(): ClockSnapshot };

export type ControllerDeps = {
  db: Db;
  clock: Clock;
  uuid: () => string;
};

export type SaveState = 'pending' | 'saved';

export type ControllerState = {
  data: SessionData;
  saveStates: Readonly<Record<string, SaveState>>;
  queue: QueueStatus;
  selectedEventId: string | null;
  rowMode: RowMode;
  /** Most recent generic capture still open for an optional label. */
  labelTargetId: string | null;
};

export class ActiveSessionExistsError extends Error {
  constructor() {
    super('Another session is already active on this device.');
  }
}

export function sanitizeLabel(input: string): string | null {
  const trimmed = input.replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX_LENGTH);
  return trimmed.length ? trimmed : null;
}

const rowPrefKey = (sessionId: string) => `rowAllAtSequence:${sessionId}`;

/**
 * Owns one loaded session. Capture paths read the clock first, allocate the
 * capture sequence synchronously, update memory, and only then queue the write.
 */
export class SessionController {
  private state: ControllerState;
  private listeners = new Set<() => void>();
  private queue: WriteQueue;
  private nextSequence: number;
  private nextMomentNumber: number;
  private nextEventNumber: number;
  private lastObserved: Checkpoint;
  private rowAllAtSequence: number | null;

  private constructor(
    private deps: ControllerDeps,
    data: SessionData,
    rowAllAtSequence: number | null,
  ) {
    const counters = repo.nextCounters(data);
    this.nextSequence = counters.nextSequence;
    this.nextMomentNumber = counters.nextMomentNumber;
    this.nextEventNumber = counters.nextEventNumber;
    this.lastObserved = data.session.checkpoint;
    this.rowAllAtSequence = rowAllAtSequence;
    this.queue = new WriteQueue(deps.db);
    const saveStates: Record<string, SaveState> = {};
    data.moments.forEach((m) => (saveStates[m.id] = 'saved'));
    const lastCapture = [...data.moments].reverse().find((m) => m.kind === 'capture');
    this.state = {
      data,
      saveStates,
      queue: this.queue.status(),
      selectedEventId: null,
      rowMode: deriveRowMode(data.moments, rowAllAtSequence),
      labelTargetId:
        data.session.status === 'active' && lastCapture && !lastCapture.label ? lastCapture.id : null,
    };
    this.queue.subscribe((queue, saved) => {
      const saveStates = { ...this.state.saveStates };
      saved.forEach((id) => (saveStates[id] = 'saved'));
      this.set({ queue, saveStates });
    });
  }

  // ---------- lifecycle ----------

  /** Start snapshot is persisted before the caller may show the recording screen. */
  static async start(deps: ControllerDeps): Promise<SessionController> {
    const snapshot = deps.clock.read();
    if (await repo.getActiveSessionId(deps.db)) throw new ActiveSessionExistsError();
    const id = deps.uuid();
    const zero = elapsedMs(0);
    const session: Session = {
      id,
      shortId: id.replace(/-/g, '').slice(0, 4).toUpperCase(),
      status: 'active',
      startedSnapshot: snapshot,
      finishSnapshot: null,
      finishElapsedMs: null,
      anchor: anchorFromSnapshot(snapshot, zero),
      checkpoint: checkpointFromSnapshot(snapshot, zero),
      revision: 1,
      createdAt: snapshot.wallEpochMs,
      schemaVersion: SCHEMA_VERSION,
    };
    try {
      await repo.insertSession(deps.db, session);
    } catch (e) {
      if (/UNIQUE/i.test(String(e))) throw new ActiveSessionExistsError();
      throw e;
    }
    const data = await repo.loadSessionData(deps.db, id);
    if (!data) throw new Error('Session was not saved.');
    return new SessionController(deps, data, null);
  }

  /**
   * Loads a session. For an active session this is recovery: verify the boot,
   * fall back to a flagged wall-clock estimate if needed, and record clock changes.
   */
  static async load(deps: ControllerDeps, sessionId: string): Promise<SessionController | null> {
    const data = await repo.loadSessionData(deps.db, sessionId);
    if (!data) return null;
    const rowPref = await repo.getPref(deps.db, rowPrefKey(sessionId));
    const c = new SessionController(deps, data, rowPref === null ? null : Number(rowPref));
    if (data.session.status === 'active') await c.recover();
    return c;
  }

  private async recover(): Promise<void> {
    const snapshot = this.deps.clock.read();
    const s = this.state.data.session;
    const res = resolveAnchor(s.anchor, s.checkpoint, snapshot);
    const flags: TimingFlag[] = [];
    if (res.kind === 'estimated') {
      flags.push(
        this.flag('recovery_estimate', null, res.fromElapsedMs, res.toElapsedMs, null, null,
          'Timing estimated after recovery'),
      );
      // Clocks from different boots are not comparable; only the zone can be checked.
      if (
        snapshot.timezoneId !== s.checkpoint.timezoneId ||
        snapshot.utcOffsetMinutes !== s.checkpoint.utcOffsetMinutes
      ) {
        const [tz] = detectClockChanges(
          { ...s.checkpoint, wallEpochMs: snapshot.wallEpochMs, continuousMs: snapshot.continuousMs },
          snapshot,
        );
        if (tz) flags.push(this.flag(tz.type, null, s.checkpoint.elapsedMs, res.elapsed, null, null, tz.detail));
      }
    } else {
      for (const o of detectClockChanges(s.checkpoint, snapshot)) {
        flags.push(
          this.flag(o.type, null, s.checkpoint.elapsedMs, res.elapsed, o.wallDeltaMs, o.continuousDeltaMs, o.detail),
        );
      }
    }
    const checkpoint = checkpointFromSnapshot(snapshot, res.elapsed);
    this.lastObserved = checkpoint;
    const session: Session = { ...s, anchor: res.anchor, checkpoint };
    this.set({ data: { ...this.state.data, session, flags: [...this.state.data.flags, ...flags] } });
    await this.queue.enqueue({
      id: `recover-${session.id}-${snapshot.continuousMs}`,
      recordIds: [],
      run: (db) =>
        db.withTransactionAsync(async () => {
          await repo.updateSessionState(db, session);
          for (const f of flags) await repo.insertFlag(db, f);
        }),
    });
  }

  // ---------- subscription ----------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): ControllerState => this.state;

  private set(patch: Partial<ControllerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  get sessionId(): string {
    return this.state.data.session.id;
  }

  get isActive(): boolean {
    return this.state.data.session.status === 'active';
  }

  readClock(): ClockSnapshot {
    return this.deps.clock.read();
  }

  /** Elapsed for display. Finished sessions report their finish boundary. */
  elapsedAt(snapshot: ClockSnapshot): ElapsedMs {
    const s = this.state.data.session;
    if (s.status === 'finished') return s.finishElapsedMs ?? elapsedMs(0);
    return computeElapsed(s.anchor, snapshot);
  }

  whenSaved(): Promise<void> {
    return this.queue.whenIdle();
  }

  retry(): void {
    this.queue.retry();
  }

  // ---------- capture ----------

  /** Generic "Mark moment / Other" capture. Returns the new moment id. */
  markMoment(): string {
    const snapshot = this.deps.clock.read();
    return this.capture(snapshot, 'capture', null);
  }

  /** Preset milestone capture. APGAR never comes here: it opens the editor instead. */
  markMilestone(code: Exclude<MilestoneCode, 'APGAR'>): string {
    const snapshot = this.deps.clock.read();
    return this.capture(snapshot, 'milestone', code);
  }

  private capture(snapshot: ClockSnapshot, kind: 'capture' | 'milestone', code: MilestoneCode | null): string {
    this.assertActive();
    const captureSequence = this.nextSequence++;
    const momentNumber = kind === 'capture' ? this.nextMomentNumber++ : null;
    const s = this.state.data.session;
    const elapsed = computeElapsed(s.anchor, snapshot);
    const id = this.deps.uuid();
    const selected = this.state.data.events.find(
      (e) => e.id === this.state.selectedEventId && e.status === 'active',
    );
    const moment: Moment = {
      id,
      sessionId: s.id,
      eventId: selected?.id ?? null,
      captureSequence,
      kind,
      momentNumber,
      snapshot,
      originalElapsedMs: elapsed,
      effectiveWallMs: null,
      effectiveElapsedMs: null,
      label: null,
      source: 'captured',
      flaggedAccidental: false,
      milestoneCode: code,
      timingEstimated: s.anchor.estimated,
    };
    const { flags, checkpoint } = this.observe(snapshot, elapsed, id);
    const pendingLabel = this.state.labelTargetId;
    const data = {
      ...this.state.data,
      session: { ...s, checkpoint },
      moments: [...this.state.data.moments, moment],
      flags: [...this.state.data.flags, ...flags],
    };
    this.set({
      data,
      saveStates: { ...this.state.saveStates, [id]: 'pending' },
      rowMode: deriveRowMode(data.moments, this.rowAllAtSequence),
      labelTargetId: kind === 'capture' ? id : pendingLabel,
    });
    void this.queue.enqueue({
      id: `moment-${id}`,
      recordIds: [id],
      run: (db) =>
        db.withTransactionAsync(async () => {
          await repo.insertMoment(db, moment);
          for (const f of flags) await repo.insertFlag(db, f);
          await repo.updateCheckpoint(db, s.id, checkpoint);
        }),
    });
    return id;
  }

  /** Records clock or zone changes since the last observation in this process. */
  private observe(snapshot: ClockSnapshot, elapsed: ElapsedMs, momentId: string | null) {
    const flags = detectClockChanges(this.lastObserved, snapshot).map((o) =>
      this.flag(o.type, momentId, this.lastObserved.elapsedMs, elapsed, o.wallDeltaMs, o.continuousDeltaMs, o.detail),
    );
    const checkpoint = checkpointFromSnapshot(snapshot, elapsed);
    this.lastObserved = checkpoint;
    return { flags, checkpoint };
  }

  /** Periodic and foreground checkpoint. Display refreshes never call this. */
  checkpoint(): void {
    if (!this.isActive) return;
    const snapshot = this.deps.clock.read();
    const s = this.state.data.session;
    const { flags, checkpoint } = this.observe(snapshot, computeElapsed(s.anchor, snapshot), null);
    this.set({
      data: { ...this.state.data, session: { ...s, checkpoint }, flags: [...this.state.data.flags, ...flags] },
    });
    void this.queue.enqueue({
      id: `checkpoint-${s.id}-${snapshot.continuousMs}`,
      recordIds: [],
      run: (db) =>
        db.withTransactionAsync(async () => {
          for (const f of flags) await repo.insertFlag(db, f);
          await repo.updateCheckpoint(db, s.id, checkpoint);
        }),
    });
  }

  // ---------- labels ----------

  labelMoment(momentId: string, rawLabel: string, reason: string | null = null): void {
    const m = this.state.data.moments.find((x) => x.id === momentId);
    if (!m || (m.kind !== 'capture' && m.kind !== 'milestone')) return;
    const label = sanitizeLabel(rawLabel);
    if (label === m.label) return;
    const updated: Moment = { ...m, label };
    this.applyMomentChange(updated, 'label', m.label, label, reason);
  }

  /** Closes the optional label prompt without changing the record. */
  dismissLabel(): void {
    this.set({ labelTargetId: null });
  }

  // ---------- events ----------

  startEvent(): string {
    const snapshot = this.deps.clock.read();
    this.assertActive();
    const captureSequence = this.nextSequence++;
    const s = this.state.data.session;
    const elapsed = computeElapsed(s.anchor, snapshot);
    const eventId = this.deps.uuid();
    const momentId = this.deps.uuid();
    const event: SessionEvent = {
      id: eventId,
      sessionId: s.id,
      number: this.nextEventNumber++,
      label: null,
      startMomentId: momentId,
      endMomentId: null,
      status: 'active',
      endedBySessionFinish: false,
    };
    const moment = this.systemMoment(momentId, 'event_start', eventId, captureSequence, snapshot, elapsed);
    const { flags, checkpoint } = this.observe(snapshot, elapsed, momentId);
    this.set({
      data: {
        ...this.state.data,
        session: { ...s, checkpoint },
        events: [...this.state.data.events, event],
        moments: [...this.state.data.moments, moment],
        flags: [...this.state.data.flags, ...flags],
      },
      saveStates: { ...this.state.saveStates, [momentId]: 'pending' },
      selectedEventId: eventId,
    });
    void this.queue.enqueue({
      id: `event-start-${eventId}`,
      recordIds: [momentId],
      run: (db) =>
        db.withTransactionAsync(async () => {
          await repo.insertEvent(db, event);
          await repo.insertMoment(db, moment);
          for (const f of flags) await repo.insertFlag(db, f);
          await repo.updateCheckpoint(db, s.id, checkpoint);
        }),
    });
    return eventId;
  }

  endEvent(eventId: string): void {
    const snapshot = this.deps.clock.read();
    this.assertActive();
    const ev = this.state.data.events.find((e) => e.id === eventId);
    if (!ev || ev.status !== 'active') return;
    const captureSequence = this.nextSequence++;
    const s = this.state.data.session;
    const elapsed = computeElapsed(s.anchor, snapshot);
    const momentId = this.deps.uuid();
    const moment = this.systemMoment(momentId, 'event_end', eventId, captureSequence, snapshot, elapsed);
    const ended: SessionEvent = { ...ev, status: 'ended', endMomentId: momentId };
    const { flags, checkpoint } = this.observe(snapshot, elapsed, momentId);
    this.set({
      data: {
        ...this.state.data,
        session: { ...s, checkpoint },
        events: this.state.data.events.map((e) => (e.id === eventId ? ended : e)),
        moments: [...this.state.data.moments, moment],
        flags: [...this.state.data.flags, ...flags],
      },
      saveStates: { ...this.state.saveStates, [momentId]: 'pending' },
      selectedEventId: this.state.selectedEventId === eventId ? null : this.state.selectedEventId,
    });
    void this.queue.enqueue({
      id: `event-end-${eventId}`,
      recordIds: [momentId],
      run: (db) =>
        db.withTransactionAsync(async () => {
          await repo.insertMoment(db, moment);
          await repo.updateEvent(db, ended);
          for (const f of flags) await repo.insertFlag(db, f);
          await repo.updateCheckpoint(db, s.id, checkpoint);
        }),
    });
  }

  /** Changes which active event new captures group into. null = Session. */
  selectEvent(eventId: string | null): void {
    const ok = eventId === null || this.state.data.events.some((e) => e.id === eventId && e.status === 'active');
    if (ok) this.set({ selectedEventId: eventId });
  }

  labelEvent(eventId: string, rawLabel: string): void {
    const ev = this.state.data.events.find((e) => e.id === eventId);
    if (!ev) return;
    const label = sanitizeLabel(rawLabel);
    if (label === ev.label) return;
    const updated = { ...ev, label };
    const { revision, session } = this.nextRevision('event_label', { eventId }, ev.label, label, null);
    this.set({
      data: {
        ...this.state.data,
        session,
        events: this.state.data.events.map((e) => (e.id === eventId ? updated : e)),
        revisions: [...this.state.data.revisions, revision],
      },
    });
    void this.queue.enqueue({
      id: `event-label-${revision.id}`,
      recordIds: [],
      run: (db) =>
        db.withTransactionAsync(async () => {
          await repo.updateEvent(db, updated);
          await repo.insertRevision(db, revision);
          await repo.setSessionRevision(db, session.id, session.revision);
        }),
    });
  }

  // ---------- milestone row ----------

  showAllMilestones(): void {
    this.rowAllAtSequence = this.nextSequence - 1;
    this.set({ rowMode: deriveRowMode(this.state.data.moments, this.rowAllAtSequence) });
    const key = rowPrefKey(this.sessionId);
    const value = String(this.rowAllAtSequence);
    void this.queue.enqueue({ id: `pref-${key}-${value}`, recordIds: [], run: (db) => repo.setPref(db, key, value) });
  }

  // ---------- finish / resume ----------

  /**
   * One snapshot finishes the session and every active event in a single
   * transaction. Resolves once committed.
   */
  finish(): Promise<void> {
    const snapshot = this.deps.clock.read();
    this.assertActive();
    const s = this.state.data.session;
    const elapsed = computeElapsed(s.anchor, snapshot);
    const { flags, checkpoint } = this.observe(snapshot, elapsed, null);
    const finishMoment = this.systemMoment(this.deps.uuid(), 'finish', null, this.nextSequence++, snapshot, elapsed);
    const endMoments: Moment[] = [];
    const endedEvents: SessionEvent[] = [];
    for (const ev of this.state.data.events.filter((e) => e.status === 'active')) {
      const m = this.systemMoment(this.deps.uuid(), 'event_end', ev.id, this.nextSequence++, snapshot, elapsed);
      endMoments.push(m);
      endedEvents.push({ ...ev, status: 'ended', endMomentId: m.id, endedBySessionFinish: true });
    }
    const { revision, session: revised } = this.nextRevision('finish', {}, null, String(elapsed), null);
    const session: Session = {
      ...revised,
      status: 'finished',
      finishSnapshot: snapshot,
      finishElapsedMs: elapsed,
      checkpoint,
    };
    const newMoments = [finishMoment, ...endMoments];
    const saveStates = { ...this.state.saveStates };
    newMoments.forEach((m) => (saveStates[m.id] = 'pending'));
    this.set({
      data: {
        ...this.state.data,
        session,
        moments: [...this.state.data.moments, ...newMoments],
        events: this.state.data.events.map((e) => endedEvents.find((x) => x.id === e.id) ?? e),
        revisions: [...this.state.data.revisions, revision],
        flags: [...this.state.data.flags, ...flags],
      },
      saveStates,
      selectedEventId: null,
      labelTargetId: null,
    });
    return this.queue.enqueue({
      id: `finish-${finishMoment.id}`,
      recordIds: newMoments.map((m) => m.id),
      run: (db) =>
        db.withTransactionAsync(async () => {
          for (const m of newMoments) await repo.insertMoment(db, m);
          for (const e of endedEvents) await repo.updateEvent(db, e);
          for (const f of flags) await repo.insertFlag(db, f);
          await repo.insertRevision(db, revision);
          await repo.updateSessionState(db, session);
        }),
    });
  }

  /**
   * Reopens a mistakenly finished session. The gap stays in overall elapsed time,
   * previously ended events stay ended, and the prior finish remains in history.
   * Persisted before the caller may show recording again.
   */
  async resume(): Promise<void> {
    const snapshot = this.deps.clock.read();
    const s = this.state.data.session;
    if (s.status !== 'finished') return;
    await this.queue.whenIdle();
    if (this.queue.status().failed) throw new Error('Earlier changes are not saved yet. Retry first.');
    if (await repo.getActiveSessionId(this.deps.db)) throw new ActiveSessionExistsError();
    const res = resolveAnchor(s.anchor, s.checkpoint, snapshot);
    const flags: TimingFlag[] = [];
    if (res.kind === 'estimated') {
      flags.push(
        this.flag('recovery_estimate', null, res.fromElapsedMs, res.toElapsedMs, null, null,
          'Timing estimated after recovery'),
      );
    }
    const resumeMoment = this.systemMoment(this.deps.uuid(), 'resume', null, this.nextSequence, snapshot, res.elapsed);
    resumeMoment.timingEstimated = res.anchor.estimated;
    const { revision, session: revised } = this.nextRevision(
      'resume',
      {},
      String(s.finishElapsedMs),
      String(res.elapsed),
      null,
    );
    const session: Session = {
      ...revised,
      status: 'active',
      finishSnapshot: null,
      finishElapsedMs: null,
      anchor: res.anchor,
      checkpoint: checkpointFromSnapshot(snapshot, res.elapsed),
    };
    try {
      await this.deps.db.withTransactionAsync(async () => {
        await repo.insertMoment(this.deps.db, resumeMoment);
        for (const f of flags) await repo.insertFlag(this.deps.db, f);
        await repo.insertRevision(this.deps.db, revision);
        await repo.updateSessionState(this.deps.db, session);
      });
    } catch (e) {
      if (/UNIQUE/i.test(String(e))) throw new ActiveSessionExistsError();
      throw e;
    }
    this.nextSequence++;
    this.lastObserved = session.checkpoint;
    this.set({
      data: {
        ...this.state.data,
        session,
        moments: [...this.state.data.moments, resumeMoment],
        revisions: [...this.state.data.revisions, revision],
        flags: [...this.state.data.flags, ...flags],
      },
      saveStates: { ...this.state.saveStates, [resumeMoment.id]: 'saved' },
    });
  }

  // ---------- APGAR ----------

  saveAssessment(point: AssessmentPoint, score: number): void {
    if (!Number.isInteger(score) || score < 0 || score > 10) {
      throw new RangeError('APGAR score must be an integer from 0 to 10.');
    }
    const existing = this.state.data.assessments.find((a) => a.assessmentPoint === point);
    if (existing?.score === score) return;
    const assessment: Assessment = existing
      ? { ...existing, score }
      : { id: this.deps.uuid(), sessionId: this.sessionId, assessmentPoint: point, score };
    const { revision, session } = this.nextRevision(
      'assessment',
      { assessmentId: assessment.id },
      existing ? String(existing.score) : null,
      String(score),
      point,
    );
    this.set({
      data: {
        ...this.state.data,
        session,
        assessments: existing
          ? this.state.data.assessments.map((a) => (a.id === existing.id ? assessment : a))
          : [...this.state.data.assessments, assessment],
        revisions: [...this.state.data.revisions, revision],
      },
    });
    void this.queue.enqueue({
      id: `assessment-${revision.id}`,
      recordIds: [assessment.id],
      run: (db) =>
        db.withTransactionAsync(async () => {
          await repo.upsertAssessment(db, assessment);
          await repo.insertRevision(db, revision);
          await repo.setSessionRevision(db, session.id, session.revision);
        }),
    });
  }

  // ---------- corrections ----------

  setAccidental(momentId: string, flagged: boolean, reason: string | null = null): void {
    const m = this.state.data.moments.find((x) => x.id === momentId);
    if (!m || (m.kind !== 'capture' && m.kind !== 'milestone') || m.flaggedAccidental === flagged) return;
    const updated = { ...m, flaggedAccidental: flagged };
    this.applyMomentChange(
      updated,
      flagged ? 'flag_accidental' : 'unflag_accidental',
      String(m.flaggedAccidental),
      String(flagged),
      reason,
    );
  }

  /** End of the period corrections may fall in: finish boundary, or now. */
  sessionEndElapsed(): ElapsedMs {
    return this.elapsedAt(this.deps.clock.read());
  }

  correctTime(
    momentId: string,
    input: ManualTimeInput,
    reason: string | null = null,
  ): { ok: true; ambiguous: boolean } | { ok: false; error: string } {
    const m = this.state.data.moments.find((x) => x.id === momentId);
    if (!m || (m.kind !== 'capture' && m.kind !== 'milestone')) return { ok: false, error: 'Only moments can be corrected.' };
    const r = resolveManualTime(this.state.data, input, m.eventId, this.sessionEndElapsed());
    if (!r.ok) return r;
    const old = JSON.stringify({ elapsed: effectiveElapsed(m), wall: m.effectiveWallMs ?? m.snapshot?.wallEpochMs ?? null });
    const updated: Moment = {
      ...m,
      effectiveElapsedMs: r.elapsed,
      effectiveWallMs: r.wall,
      source: m.source === 'manual' ? 'manual' : 'corrected',
    };
    const flags = r.ambiguous
      ? [this.flag('manual_time', m.id, r.elapsed, r.elapsed, null, null, 'Manual time near a clock change')]
      : [];
    this.applyMomentChange(updated, 'correct_time', old, JSON.stringify({ elapsed: r.elapsed, wall: r.wall }), reason, flags);
    return { ok: true, ambiguous: r.ambiguous };
  }

  addMissedMoment(
    input: ManualTimeInput,
    rawLabel: string,
    eventId: string | null,
    reason: string | null = null,
  ): { ok: true; id: string; ambiguous: boolean } | { ok: false; error: string } {
    const r = resolveManualTime(this.state.data, input, eventId, this.sessionEndElapsed());
    if (!r.ok) return r;
    const id = this.deps.uuid();
    const moment: Moment = {
      id,
      sessionId: this.sessionId,
      eventId,
      captureSequence: this.nextSequence++,
      kind: 'capture',
      momentNumber: this.nextMomentNumber++,
      snapshot: null,
      originalElapsedMs: null,
      effectiveWallMs: r.wall,
      effectiveElapsedMs: r.elapsed,
      label: sanitizeLabel(rawLabel),
      source: 'manual',
      flaggedAccidental: false,
      milestoneCode: null,
      timingEstimated: false,
    };
    const flags = r.ambiguous
      ? [this.flag('manual_time', id, r.elapsed, r.elapsed, null, null, 'Manual time near a clock change')]
      : [];
    const { revision, session } = this.nextRevision(
      'add_manual',
      { momentId: id },
      null,
      JSON.stringify({ elapsed: r.elapsed, wall: r.wall, label: moment.label }),
      reason,
    );
    this.set({
      data: {
        ...this.state.data,
        session,
        moments: [...this.state.data.moments, moment],
        revisions: [...this.state.data.revisions, revision],
        flags: [...this.state.data.flags, ...flags],
      },
      saveStates: { ...this.state.saveStates, [id]: 'pending' },
    });
    void this.queue.enqueue({
      id: `manual-${id}`,
      recordIds: [id],
      run: (db) =>
        db.withTransactionAsync(async () => {
          await repo.insertMoment(db, moment);
          for (const f of flags) await repo.insertFlag(db, f);
          await repo.insertRevision(db, revision);
          await repo.setSessionRevision(db, session.id, session.revision);
        }),
    });
    return { ok: true, id, ambiguous: r.ambiguous };
  }

  // ---------- exports ----------

  recordExport(record: Omit<ExportRecord, 'id' | 'sessionId' | 'revisionNumber'>): ExportRecord {
    const rec: ExportRecord = {
      ...record,
      id: this.deps.uuid(),
      sessionId: this.sessionId,
      revisionNumber: this.state.data.session.revision,
    };
    this.set({ data: { ...this.state.data, exports: [...this.state.data.exports, rec] } });
    void this.queue.enqueue({ id: `export-${rec.id}`, recordIds: [rec.id], run: (db) => repo.insertExport(db, rec) });
    return rec;
  }

  clearExportCache(exportId: string): void {
    this.set({
      data: {
        ...this.state.data,
        exports: this.state.data.exports.map((e) => (e.id === exportId ? { ...e, cachedFilePath: null } : e)),
      },
    });
    void this.queue.enqueue({ id: `export-clear-${exportId}`, recordIds: [], run: (db) => repo.clearExportCache(db, exportId) });
  }

  // ---------- helpers ----------

  private assertActive() {
    if (this.state.data.session.status !== 'active') throw new Error('Session is not active.');
  }

  private systemMoment(
    id: string,
    kind: Moment['kind'],
    eventId: string | null,
    captureSequence: number,
    snapshot: ClockSnapshot,
    elapsed: ElapsedMs,
  ): Moment {
    return {
      id,
      sessionId: this.sessionId,
      eventId,
      captureSequence,
      kind,
      momentNumber: null,
      snapshot,
      originalElapsedMs: elapsed,
      effectiveWallMs: null,
      effectiveElapsedMs: null,
      label: null,
      source: 'captured',
      flaggedAccidental: false,
      milestoneCode: null,
      timingEstimated: this.state.data.session.anchor.estimated,
    };
  }

  private flag(
    type: TimingFlag['type'],
    momentId: string | null,
    from: ElapsedMs | null,
    to: ElapsedMs | null,
    wallDeltaMs: number | null,
    continuousDeltaMs: number | null,
    detail: string | null,
  ): TimingFlag {
    return {
      id: this.deps.uuid(),
      sessionId: this.sessionId,
      momentId,
      type,
      fromElapsedMs: from,
      toElapsedMs: to,
      wallDeltaMs,
      continuousDeltaMs,
      detail,
      createdAt: Date.now() as WallMs,
    };
  }

  private nextRevision(
    action: RevisionAction,
    target: { momentId?: string; assessmentId?: string; eventId?: string },
    oldValue: string | null,
    newValue: string | null,
    reason: string | null,
  ): { revision: Revision; session: Session } {
    const session = { ...this.state.data.session, revision: this.state.data.session.revision + 1 };
    return {
      session,
      revision: {
        id: this.deps.uuid(),
        sessionId: session.id,
        momentId: target.momentId ?? null,
        assessmentId: target.assessmentId ?? null,
        eventId: target.eventId ?? null,
        action,
        oldValue,
        newValue,
        reason,
        changedAt: this.deps.clock.read().wallEpochMs,
        revisionNumber: session.revision,
      },
    };
  }

  private applyMomentChange(
    updated: Moment,
    action: RevisionAction,
    oldValue: string | null,
    newValue: string | null,
    reason: string | null,
    flags: TimingFlag[] = [],
  ) {
    const { revision, session } = this.nextRevision(action, { momentId: updated.id }, oldValue, newValue, reason);
    const data = {
      ...this.state.data,
      session,
      moments: this.state.data.moments.map((m) => (m.id === updated.id ? updated : m)),
      revisions: [...this.state.data.revisions, revision],
      flags: [...this.state.data.flags, ...flags],
    };
    this.set({
      data,
      rowMode: deriveRowMode(data.moments, this.rowAllAtSequence),
      labelTargetId: action === 'label' && this.state.labelTargetId === updated.id ? null : this.state.labelTargetId,
    });
    void this.queue.enqueue({
      id: `change-${revision.id}`,
      recordIds: [],
      run: (db) =>
        db.withTransactionAsync(async () => {
          await repo.updateMoment(db, updated);
          for (const f of flags) await repo.insertFlag(db, f);
          await repo.insertRevision(db, revision);
          await repo.setSessionRevision(db, session.id, session.revision);
        }),
    });
  }
}
