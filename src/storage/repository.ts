import type {
  Assessment,
  Checkpoint,
  ClockAnchor,
  ClockSnapshot,
  ElapsedMs,
  ExportRecord,
  MilestoneCode,
  Moment,
  Revision,
  Session,
  SessionData,
  SessionEvent,
  TimingFlag,
  WallMs,
} from '../domain/types';
import type { BindValue, Db } from './db';

const json = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));
const parse = <T>(v: string | null): T | null => (v === null ? null : (JSON.parse(v) as T));
const bool = (v: boolean) => (v ? 1 : 0);

type SessionRow = {
  id: string;
  short_id: string;
  status: Session['status'];
  started_snapshot: string;
  finish_snapshot: string | null;
  finish_elapsed_ms: number | null;
  anchor: string;
  checkpoint: string;
  revision: number;
  created_at: number;
  schema_version: number;
};

type MomentRow = {
  id: string;
  session_id: string;
  event_id: string | null;
  capture_sequence: number;
  kind: Moment['kind'];
  moment_number: number | null;
  snapshot: string | null;
  original_elapsed_ms: number | null;
  effective_wall_ms: number | null;
  effective_elapsed_ms: number | null;
  label: string | null;
  source: Moment['source'];
  flagged_accidental: number;
  milestone_code: string | null;
  timing_estimated: number;
};

type EventRow = {
  id: string;
  session_id: string;
  number: number;
  label: string | null;
  start_moment_id: string;
  end_moment_id: string | null;
  status: SessionEvent['status'];
  ended_by_session_finish: number;
};

const toSession = (r: SessionRow): Session => ({
  id: r.id,
  shortId: r.short_id,
  status: r.status,
  startedSnapshot: parse<ClockSnapshot>(r.started_snapshot)!,
  finishSnapshot: parse<ClockSnapshot>(r.finish_snapshot),
  finishElapsedMs: r.finish_elapsed_ms as ElapsedMs | null,
  anchor: parse<ClockAnchor>(r.anchor)!,
  checkpoint: parse<Checkpoint>(r.checkpoint)!,
  revision: r.revision,
  createdAt: r.created_at as WallMs,
  schemaVersion: r.schema_version,
});

const toMoment = (r: MomentRow): Moment => ({
  id: r.id,
  sessionId: r.session_id,
  eventId: r.event_id,
  captureSequence: r.capture_sequence,
  kind: r.kind,
  momentNumber: r.moment_number,
  snapshot: parse<ClockSnapshot>(r.snapshot),
  originalElapsedMs: r.original_elapsed_ms as ElapsedMs | null,
  effectiveWallMs: r.effective_wall_ms as WallMs | null,
  effectiveElapsedMs: r.effective_elapsed_ms as ElapsedMs | null,
  label: r.label,
  source: r.source,
  flaggedAccidental: r.flagged_accidental === 1,
  milestoneCode: r.milestone_code as MilestoneCode | null,
  timingEstimated: r.timing_estimated === 1,
});

const toEvent = (r: EventRow): SessionEvent => ({
  id: r.id,
  sessionId: r.session_id,
  number: r.number,
  label: r.label,
  startMomentId: r.start_moment_id,
  endMomentId: r.end_moment_id,
  status: r.status,
  endedBySessionFinish: r.ended_by_session_finish === 1,
});

// ---------- writes (all idempotent so retries never duplicate) ----------

export async function insertSession(db: Db, s: Session): Promise<void> {
  await db.runAsync(
    `INSERT INTO sessions (id, short_id, status, started_snapshot, finish_snapshot, finish_elapsed_ms,
       anchor, checkpoint, revision, created_at, schema_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    [
      s.id,
      s.shortId,
      s.status,
      json(s.startedSnapshot),
      json(s.finishSnapshot),
      s.finishElapsedMs,
      json(s.anchor),
      json(s.checkpoint),
      s.revision,
      s.createdAt,
      s.schemaVersion,
    ],
  );
}

/** Persists status, finish boundary, anchor, checkpoint, and revision together. */
export async function updateSessionState(db: Db, s: Session): Promise<void> {
  await db.runAsync(
    `UPDATE sessions SET status = ?, finish_snapshot = ?, finish_elapsed_ms = ?, anchor = ?,
       checkpoint = ?, revision = ? WHERE id = ?`,
    [
      s.status,
      json(s.finishSnapshot),
      s.finishElapsedMs,
      json(s.anchor),
      json(s.checkpoint),
      s.revision,
      s.id,
    ],
  );
}

export async function updateCheckpoint(db: Db, sessionId: string, checkpoint: Checkpoint): Promise<void> {
  await db.runAsync('UPDATE sessions SET checkpoint = ? WHERE id = ?', [json(checkpoint), sessionId]);
}

export async function insertMoment(db: Db, m: Moment): Promise<void> {
  await db.runAsync(
    `INSERT INTO moments (id, session_id, event_id, capture_sequence, kind, moment_number, snapshot,
       original_elapsed_ms, effective_wall_ms, effective_elapsed_ms, label, source, flagged_accidental,
       milestone_code, timing_estimated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    [
      m.id,
      m.sessionId,
      m.eventId,
      m.captureSequence,
      m.kind,
      m.momentNumber,
      json(m.snapshot),
      m.originalElapsedMs,
      m.effectiveWallMs,
      m.effectiveElapsedMs,
      m.label,
      m.source,
      bool(m.flaggedAccidental),
      m.milestoneCode,
      bool(m.timingEstimated),
    ],
  );
}

/** Mutable fields only; the original snapshot and elapsed value are never rewritten. */
export async function updateMoment(db: Db, m: Moment): Promise<void> {
  await db.runAsync(
    `UPDATE moments SET event_id = ?, effective_wall_ms = ?, effective_elapsed_ms = ?, label = ?,
       source = ?, flagged_accidental = ? WHERE id = ?`,
    [
      m.eventId,
      m.effectiveWallMs,
      m.effectiveElapsedMs,
      m.label,
      m.source,
      bool(m.flaggedAccidental),
      m.id,
    ],
  );
}

export async function insertEvent(db: Db, e: SessionEvent): Promise<void> {
  await db.runAsync(
    `INSERT INTO events (id, session_id, number, label, start_moment_id, end_moment_id, status,
       ended_by_session_finish)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    [
      e.id,
      e.sessionId,
      e.number,
      e.label,
      e.startMomentId,
      e.endMomentId,
      e.status,
      bool(e.endedBySessionFinish),
    ],
  );
}

export async function updateEvent(db: Db, e: SessionEvent): Promise<void> {
  await db.runAsync(
    `UPDATE events SET label = ?, end_moment_id = ?, status = ?, ended_by_session_finish = ? WHERE id = ?`,
    [e.label, e.endMomentId, e.status, bool(e.endedBySessionFinish), e.id],
  );
}

export async function insertRevision(db: Db, r: Revision): Promise<void> {
  await db.runAsync(
    `INSERT INTO revisions (id, session_id, moment_id, assessment_id, event_id, action, old_value,
       new_value, reason, changed_at, revision_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    [
      r.id,
      r.sessionId,
      r.momentId,
      r.assessmentId,
      r.eventId,
      r.action,
      r.oldValue,
      r.newValue,
      r.reason,
      r.changedAt,
      r.revisionNumber,
    ],
  );
}

export async function setSessionRevision(db: Db, sessionId: string, revision: number): Promise<void> {
  await db.runAsync('UPDATE sessions SET revision = MAX(revision, ?) WHERE id = ?', [revision, sessionId]);
}

export async function upsertAssessment(db: Db, a: Assessment): Promise<void> {
  await db.runAsync(
    `INSERT INTO assessments (id, session_id, assessment_point, score) VALUES (?, ?, ?, ?)
     ON CONFLICT (session_id, assessment_point) DO UPDATE SET score = excluded.score`,
    [a.id, a.sessionId, a.assessmentPoint, a.score],
  );
}

export async function insertFlag(db: Db, f: TimingFlag): Promise<void> {
  await db.runAsync(
    `INSERT INTO timing_flags (id, session_id, moment_id, type, from_elapsed_ms, to_elapsed_ms,
       wall_delta_ms, continuous_delta_ms, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    [
      f.id,
      f.sessionId,
      f.momentId,
      f.type,
      f.fromElapsedMs,
      f.toElapsedMs,
      f.wallDeltaMs,
      f.continuousDeltaMs,
      f.detail,
      f.createdAt,
    ],
  );
}

export async function insertExport(db: Db, e: ExportRecord): Promise<void> {
  await db.runAsync(
    `INSERT INTO exports (id, session_id, revision_number, generated_at, cached_file_path)
     VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
    [e.id, e.sessionId, e.revisionNumber, e.generatedAt, e.cachedFilePath],
  );
}

export async function clearExportCache(db: Db, exportId: string): Promise<void> {
  await db.runAsync('UPDATE exports SET cached_file_path = NULL WHERE id = ?', [exportId]);
}

export async function deleteSession(db: Db, sessionId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    // Moments reference events, so clear them first even though both cascade.
    await db.runAsync('DELETE FROM moments WHERE session_id = ?', [sessionId]);
    await db.runAsync('DELETE FROM sessions WHERE id = ?', [sessionId]);
  });
}

// ---------- reads ----------

export async function getActiveSessionId(db: Db): Promise<string | null> {
  const row = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM sessions WHERE status = 'active' LIMIT 1",
    [],
  );
  return row?.id ?? null;
}

export async function loadSessionData(db: Db, sessionId: string): Promise<SessionData | null> {
  const s = await db.getFirstAsync<SessionRow>('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  if (!s) return null;
  const p: BindValue[] = [sessionId];
  const [moments, events, assessments, revisions, flags, exports] = await Promise.all([
    db.getAllAsync<MomentRow>('SELECT * FROM moments WHERE session_id = ? ORDER BY capture_sequence', p),
    db.getAllAsync<EventRow>('SELECT * FROM events WHERE session_id = ? ORDER BY number', p),
    db.getAllAsync<{ id: string; session_id: string; assessment_point: Assessment['assessmentPoint']; score: number }>(
      'SELECT * FROM assessments WHERE session_id = ?',
      p,
    ),
    db.getAllAsync<{
      id: string;
      session_id: string;
      moment_id: string | null;
      assessment_id: string | null;
      event_id: string | null;
      action: Revision['action'];
      old_value: string | null;
      new_value: string | null;
      reason: string | null;
      changed_at: number;
      revision_number: number;
    }>('SELECT * FROM revisions WHERE session_id = ? ORDER BY revision_number, changed_at', p),
    db.getAllAsync<{
      id: string;
      session_id: string;
      moment_id: string | null;
      type: TimingFlag['type'];
      from_elapsed_ms: number | null;
      to_elapsed_ms: number | null;
      wall_delta_ms: number | null;
      continuous_delta_ms: number | null;
      detail: string | null;
      created_at: number;
    }>('SELECT * FROM timing_flags WHERE session_id = ? ORDER BY created_at', p),
    db.getAllAsync<{
      id: string;
      session_id: string;
      revision_number: number;
      generated_at: number;
      cached_file_path: string | null;
    }>('SELECT * FROM exports WHERE session_id = ? ORDER BY generated_at', p),
  ]);
  return {
    session: toSession(s),
    moments: moments.map(toMoment),
    events: events.map(toEvent),
    assessments: assessments.map((a) => ({
      id: a.id,
      sessionId: a.session_id,
      assessmentPoint: a.assessment_point,
      score: a.score,
    })),
    revisions: revisions.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      momentId: r.moment_id,
      assessmentId: r.assessment_id,
      eventId: r.event_id,
      action: r.action,
      oldValue: r.old_value,
      newValue: r.new_value,
      reason: r.reason,
      changedAt: r.changed_at as WallMs,
      revisionNumber: r.revision_number,
    })),
    flags: flags.map((f) => ({
      id: f.id,
      sessionId: f.session_id,
      momentId: f.moment_id,
      type: f.type,
      fromElapsedMs: f.from_elapsed_ms as ElapsedMs | null,
      toElapsedMs: f.to_elapsed_ms as ElapsedMs | null,
      wallDeltaMs: f.wall_delta_ms,
      continuousDeltaMs: f.continuous_delta_ms,
      detail: f.detail,
      createdAt: f.created_at as WallMs,
    })),
    exports: exports.map((e) => ({
      id: e.id,
      sessionId: e.session_id,
      revisionNumber: e.revision_number,
      generatedAt: e.generated_at as WallMs,
      cachedFilePath: e.cached_file_path,
    })),
  };
}

export type SessionSummary = {
  id: string;
  shortId: string;
  status: Session['status'];
  startedSnapshot: ClockSnapshot;
  finishElapsedMs: ElapsedMs | null;
  /**
   * Recording origin (see recordingOrigin in domain/timeline): the earliest
   * effective elapsed among captures and milestones not flagged accidental.
   * Null when the session has no such moment.
   */
  firstMomentElapsedMs: ElapsedMs | null;
};

export async function listSessions(db: Db): Promise<SessionSummary[]> {
  // COALESCE mirrors effectiveElapsed(): effective, then original, then 0.
  const rows = await db.getAllAsync<SessionRow & { first_moment_elapsed_ms: number | null }>(
    `SELECT s.*,
       (SELECT MIN(COALESCE(m.effective_elapsed_ms, m.original_elapsed_ms, 0))
          FROM moments m
         WHERE m.session_id = s.id
           AND m.kind IN ('capture', 'milestone')
           AND m.flagged_accidental = 0) AS first_moment_elapsed_ms
     FROM sessions s ORDER BY s.created_at DESC`,
    [],
  );
  return rows.map((r) => {
    const s = toSession(r);
    return {
      id: s.id,
      shortId: s.shortId,
      status: s.status,
      startedSnapshot: s.startedSnapshot,
      finishElapsedMs: s.finishElapsedMs,
      firstMomentElapsedMs: r.first_moment_elapsed_ms as ElapsedMs | null,
    };
  });
}

export async function getPref(db: Db, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM prefs WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setPref(db: Db, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO prefs (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

/** Highest persisted values, used to continue numbering after a relaunch. */
export function nextCounters(data: SessionData) {
  const seq = data.moments.reduce((max, m) => Math.max(max, m.captureSequence), 0);
  const momentNumber = data.moments.reduce((max, m) => Math.max(max, m.momentNumber ?? 0), 0);
  const eventNumber = data.events.reduce((max, e) => Math.max(max, e.number), 0);
  return { nextSequence: seq + 1, nextMomentNumber: momentNumber + 1, nextEventNumber: eventNumber + 1 };
}
