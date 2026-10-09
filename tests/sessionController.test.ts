import {
  ActiveSessionExistsError,
  MANUAL_MILESTONE_CODES,
  type ManualMilestoneCode,
  SessionController,
  sanitizeLabel,
} from '@/domain/sessionController';
import { effectiveElapsed, intervalsSincePrevious, liveStatus, sortByEffective } from '@/domain/timeline';
import { type Moment, wallMs } from '@/domain/types';
import { buildReport } from '@/report/reportModel';
import { migrate } from '@/storage/db';
import * as repo from '@/storage/repository';

import { FakeClock, uuid } from './helpers/fakeClock';
import { type TestDb, openTestDb } from './helpers/sqlite';

let db: TestDb;
let clock: FakeClock;
const deps = () => ({ db, clock, uuid });

beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
  clock = new FakeClock();
});

/** Simulates a process restart: a brand-new controller loaded from the database. */
async function relaunch(c: SessionController) {
  await c.whenSaved();
  const loaded = await SessionController.load(deps(), c.sessionId);
  await loaded!.whenSaved();
  return loaded!;
}

describe('A01 start', () => {
  it('persists a session with no form and enforces one active session', async () => {
    const c = await SessionController.start(deps());
    expect(await repo.getActiveSessionId(db)).toBe(c.sessionId);
    await expect(SessionController.start(deps())).rejects.toBeInstanceOf(ActiveSessionExistsError);
  });

  it('does not enter recording if the start snapshot cannot be persisted', async () => {
    db.failNext(/INSERT INTO sessions/);
    await expect(SessionController.start(deps())).rejects.toThrow(/SQLITE_FULL/);
    expect(await repo.getActiveSessionId(db)).toBeNull();
  });
});

describe('capture', () => {
  it('A02 keeps the capture time when labelled later', async () => {
    const c = await SessionController.start(deps());
    clock.advance(4000);
    const id = c.markMoment();
    const captured = c.getState().data.moments.find((m) => m.id === id)!;
    clock.advance(10_000);
    c.labelMoment(id, '  cord   clamped ');
    const after = c.getState().data.moments.find((m) => m.id === id)!;
    expect(after.label).toBe('cord clamped');
    expect(after.snapshot).toEqual(captured.snapshot);
    expect(after.originalElapsedMs).toBe(4000);
    const reloaded = await relaunch(c);
    const persisted = reloaded.getState().data.moments.find((m) => m.id === id)!;
    expect(persisted.label).toBe('cord clamped');
    expect(persisted.originalElapsedMs).toBe(4000);
  });

  it('A03 persists five rapid captures in sequence, each separately', async () => {
    const c = await SessionController.start(deps());
    const ids = [1, 2, 3, 4, 5].map(() => c.markMoment());
    expect(new Set(ids).size).toBe(5);
    expect(c.getState().saveStates[ids[0]]).toBe('pending');
    await c.whenSaved();
    const rows = (await repo.loadSessionData(db, c.sessionId))!.moments;
    expect(rows.map((m) => m.captureSequence)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.map((m) => m.momentNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(ids.every((id) => c.getState().saveStates[id] === 'saved')).toBe(true);
  });

  it('a newer capture never overwrites an earlier unlabeled record', async () => {
    const c = await SessionController.start(deps());
    const first = c.markMoment();
    expect(c.getState().labelTargetId).toBe(first);
    const second = c.markMoment();
    expect(c.getState().labelTargetId).toBe(second);
    c.labelMoment(first, 'late label');
    const moments = c.getState().data.moments;
    expect(moments.find((m) => m.id === first)!.label).toBe('late label');
    expect(moments.find((m) => m.id === second)!.label).toBeNull();
  });

  it('labels are trimmed to 80 characters', () => {
    expect(sanitizeLabel('x'.repeat(100))).toHaveLength(80);
    expect(sanitizeLabel('   ')).toBeNull();
  });

  it('A04 a milestone tap saves exactly one moment', async () => {
    const c = await SessionController.start(deps());
    c.markMilestone('HEAD');
    await c.whenSaved();
    const rows = (await repo.loadSessionData(db, c.sessionId))!.moments;
    expect(rows.filter((m) => m.milestoneCode === 'HEAD')).toHaveLength(1);
  });

  it('reads the clock before anything else on capture', async () => {
    const c = await SessionController.start(deps());
    const before = clock.reads;
    c.markMoment();
    expect(clock.reads).toBe(before + 1);
  });
});

describe('events', () => {
  it('A05 overlapping events: selecting changes grouping only; ending one leaves the other', async () => {
    const c = await SessionController.start(deps());
    clock.advance(1000);
    const e1 = c.startEvent();
    clock.advance(1000);
    const e2 = c.startEvent();
    expect(c.getState().selectedEventId).toBe(e2);
    const m2 = c.markMoment();
    c.selectEvent(e1);
    const m1 = c.markMoment();
    c.selectEvent(null);
    const m0 = c.markMoment();
    clock.advance(5000);
    c.endEvent(e1);
    const s = c.getState().data;
    expect(s.moments.find((m) => m.id === m2)!.eventId).toBe(e2);
    expect(s.moments.find((m) => m.id === m1)!.eventId).toBe(e1);
    expect(s.moments.find((m) => m.id === m0)!.eventId).toBeNull();
    expect(s.events.find((e) => e.id === e1)!.status).toBe('ended');
    expect(s.events.find((e) => e.id === e2)!.status).toBe('active');
    expect(s.session.status).toBe('active');
    expect(c.getState().selectedEventId).toBeNull();
  });

  it('event boundaries do not reset Since last moment', async () => {
    const c = await SessionController.start(deps());
    clock.advance(1000);
    const m = c.markMoment();
    clock.advance(1000);
    c.startEvent();
    clock.advance(1000);
    const m2 = c.markMoment();
    const intervals = intervalsSincePrevious(c.getState().data.moments);
    expect(intervals.get(m)).toBeNull();
    expect(intervals.get(m2)).toBe(2000);
  });
});

describe('finish and resume', () => {
  it('A06 Body and First Cry keep the session active; finish uses one boundary for everything', async () => {
    const c = await SessionController.start(deps());
    c.startEvent();
    c.startEvent();
    clock.advance(60_000);
    c.markMilestone('BODY');
    c.markMilestone('FIRST_CRY');
    expect(c.getState().data.session.status).toBe('active');
    clock.advance(30_000);
    await c.finish();
    const data = (await repo.loadSessionData(db, c.sessionId))!;
    expect(data.session.status).toBe('finished');
    expect(data.session.finishElapsedMs).toBe(90_000);
    const ends = data.moments.filter((m) => m.kind === 'event_end');
    expect(ends).toHaveLength(2);
    expect(ends.every((m) => m.originalElapsedMs === 90_000)).toBe(true);
    expect(ends.every((m) => m.snapshot!.wallEpochMs === data.session.finishSnapshot!.wallEpochMs)).toBe(true);
    expect(data.events.every((e) => e.status === 'ended' && e.endedBySessionFinish)).toBe(true);
  });

  it('A07 resume includes the gap, keeps ended events ended, and records revisions', async () => {
    const c = await SessionController.start(deps());
    const ev = c.startEvent();
    clock.advance(10_000);
    await c.finish();
    const rev = c.getState().data.session.revision;
    clock.advance(120_000);
    const reopened = await relaunch(c);
    await reopened.resume();
    const s = reopened.getState().data;
    expect(s.session.status).toBe('active');
    expect(s.events.find((e) => e.id === ev)!.status).toBe('ended');
    expect(s.session.revision).toBe(rev + 1);
    clock.advance(5000);
    expect(reopened.elapsedAt(clock.read())).toBe(135_000);
    await reopened.finish();
    const data = (await repo.loadSessionData(db, c.sessionId))!;
    expect(data.session.finishElapsedMs).toBe(135_000);
    expect(data.moments.filter((m) => m.kind === 'finish')).toHaveLength(2);
    expect(data.revisions.map((r) => r.action)).toEqual(['finish', 'resume', 'finish']);
  });

  it('resume is unavailable while another session is active', async () => {
    const c = await SessionController.start(deps());
    await c.finish();
    await SessionController.start(deps());
    await expect(c.resume()).rejects.toBeInstanceOf(ActiveSessionExistsError);
    expect(c.getState().data.session.status).toBe('finished');
  });

  it('R06 a failed finish transaction leaves the complete pre-finish state', async () => {
    const c = await SessionController.start(deps());
    c.startEvent();
    c.startEvent();
    await c.whenSaved();
    db.failNext(/UPDATE sessions SET status/);
    void c.finish();
    await c.whenSaved();
    const data = (await repo.loadSessionData(db, c.sessionId))!;
    expect(data.session.status).toBe('active');
    expect(data.events.every((e) => e.status === 'active')).toBe(true);
    expect(data.moments.filter((m) => m.kind === 'finish' || m.kind === 'event_end')).toHaveLength(0);
    c.retry();
    await c.whenSaved();
    const after = (await repo.loadSessionData(db, c.sessionId))!;
    expect(after.session.status).toBe('finished');
    expect(after.events.every((e) => e.status === 'ended')).toBe(true);
  });
});

describe('corrections', () => {
  it('A08 correct, flag, and add missed moment; originals survive and intervals recompute', async () => {
    const c = await SessionController.start(deps());
    clock.advance(10_000);
    const a = c.markMoment();
    clock.advance(10_000);
    const b = c.markMoment();
    clock.advance(10_000);
    const accidental = c.markMoment();
    clock.advance(10_000);

    c.setAccidental(accidental, true);
    const corr = c.correctTime(b, { mode: 'elapsed', elapsed: '00:00:05' });
    expect(corr.ok).toBe(true);
    const added = c.addMissedMoment({ mode: 'elapsed', elapsed: '00:00:15' }, 'missed', null);
    expect(added.ok).toBe(true);

    const data = c.getState().data;
    const bMoment = data.moments.find((m) => m.id === b)!;
    expect(bMoment.originalElapsedMs).toBe(20_000);
    expect(bMoment.effectiveElapsedMs).toBe(5000);
    expect(bMoment.source).toBe('corrected');
    const order = sortByEffective(data.moments).map((m) => m.id);
    expect(order.indexOf(b)).toBeLessThan(order.indexOf(a));
    const intervals = intervalsSincePrevious(data.moments);
    expect(intervals.get(a)).toBe(5000);
    expect(intervals.get(accidental)).toBeNull();
    expect(data.session.revision).toBe(4);

    const reloaded = await relaunch(c);
    const rows = reloaded.getState().data.moments;
    expect(rows.find((m) => m.id === accidental)!.flaggedAccidental).toBe(true);
    expect(rows.find((m) => m.id === b)!.originalElapsedMs).toBe(20_000);
    expect(reloaded.getState().data.revisions).toHaveLength(3);
  });

  it('rejects manual times outside the session or event', async () => {
    const c = await SessionController.start(deps());
    clock.advance(10_000);
    const ev = c.startEvent();
    clock.advance(10_000);
    c.endEvent(ev);
    expect(c.addMissedMoment({ mode: 'elapsed', elapsed: '01:00:00' }, '', null).ok).toBe(false);
    expect(c.addMissedMoment({ mode: 'elapsed', elapsed: '00:00:05' }, '', ev).ok).toBe(false);
    expect(c.addMissedMoment({ mode: 'elapsed', elapsed: '00:00:15' }, '', ev).ok).toBe(true);
  });

  it('accepts a local date and time and converts it with the session offset', async () => {
    const c = await SessionController.start(deps());
    clock.advance(120_000);
    const r = c.addMissedMoment({ mode: 'clock', date: '2026-10-07', time: '14:23:08', offsetMinutes: -420 }, 'x', null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(effectiveElapsed(c.getState().data.moments.find((m) => m.id === r.id)!)).toBe(60_000);
  });

  it('A08 adds a missed milestone as a manual milestone with a revision', async () => {
    const c = await SessionController.start(deps());
    clock.advance(30_000);
    const r = c.addMissedMilestone('CROWN', { mode: 'elapsed', elapsed: '00:00:10' }, '  slow  descent ');
    expect(r).toEqual({ ok: true, id: expect.any(String), ambiguous: false });
    if (!r.ok) return;
    const check = (moments: Moment[]) => {
      expect(moments.find((x) => x.id === r.id)).toMatchObject({
        kind: 'milestone',
        milestoneCode: 'CROWN',
        source: 'manual',
        snapshot: null,
        originalElapsedMs: null,
        effectiveElapsedMs: 10_000,
        momentNumber: null,
        eventId: null,
        label: 'slow descent',
        flaggedAccidental: false,
      });
    };
    check(c.getState().data.moments);
    const revisions = c.getState().data.revisions;
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ action: 'add_manual', momentId: r.id });
    expect(JSON.parse(revisions[0].newValue!)).toMatchObject({ elapsed: 10_000, milestoneCode: 'CROWN' });
    expect(c.getState().data.session.revision).toBe(2);

    const reloaded = await relaunch(c);
    check(reloaded.getState().data.moments);
    expect(reloaded.getState().data.revisions).toHaveLength(1);
    expect(reloaded.getState().data.session.revision).toBe(2);
  });

  it('A08 rejects a missed milestone outside the session and writes nothing', async () => {
    const c = await SessionController.start(deps());
    clock.advance(10_000);
    const before = c.getState().data;
    expect(c.addMissedMilestone('HEAD', { mode: 'elapsed', elapsed: '00:05:00' }, '')).toEqual({
      ok: false,
      error: 'That time is outside this session.',
    });
    // One hour before the 14:22:08 start.
    const early = c.addMissedMilestone('HEAD', { mode: 'clock', date: '2026-10-07', time: '13:22:08', offsetMinutes: -420 }, '');
    expect(early.ok).toBe(false);
    // APGAR is untimed and never becomes a timeline moment, even if a caller forces it.
    const apgar = c.addMissedMilestone('APGAR' as ManualMilestoneCode, { mode: 'elapsed', elapsed: '00:00:05' }, '');
    expect(apgar.ok).toBe(false);
    expect(c.getState().data.moments).toEqual(before.moments);
    expect(c.getState().data.revisions).toHaveLength(0);
    expect(c.getState().data.session.revision).toBe(before.session.revision);
  });

  it('A08 after finish, a missed milestone must fall before the finish boundary', async () => {
    const c = await SessionController.start(deps());
    clock.advance(20_000);
    await c.finish();
    clock.advance(60_000);
    expect(c.addMissedMilestone('PLACENTA', { mode: 'elapsed', elapsed: '00:00:30' }, '').ok).toBe(false);
    expect(c.addMissedMilestone('PLACENTA', { mode: 'elapsed', elapsed: '00:00:15' }, '').ok).toBe(true);
  });

  it('R05 a failed manual milestone write retries without duplicating', async () => {
    const c = await SessionController.start(deps());
    clock.advance(20_000);
    db.failNext(/INSERT INTO moments/);
    const r = c.addMissedMilestone('HEAD', { mode: 'elapsed', elapsed: '00:00:10' }, '');
    if (!r.ok) throw new Error(r.error);
    await c.whenSaved();
    expect(c.getState().queue.failed).toBe(true);
    expect(c.getState().saveStates[r.id]).toBe('pending');
    c.retry();
    await c.whenSaved();
    expect(c.getState().saveStates[r.id]).toBe('saved');
    const rows = (await repo.loadSessionData(db, c.sessionId))!;
    expect(rows.moments.filter((m) => m.milestoneCode === 'HEAD')).toHaveLength(1);
    expect(rows.revisions).toHaveLength(1);
  });

  it('A08 a manual milestone shows by name in the report and joins intervals and live status', async () => {
    const c = await SessionController.start(deps());
    clock.advance(10_000);
    c.markMilestone('ROM');
    clock.advance(20_000);
    const head = c.markMilestone('HEAD');
    const crown = c.addMissedMilestone('CROWN', { mode: 'elapsed', elapsed: '00:00:20' }, '');
    const body = c.addMissedMilestone('BODY', { mode: 'elapsed', elapsed: '00:00:30' }, 'shoulder');
    if (!crown.ok || !body.ok) throw new Error('manual milestones should be accepted');
    const data = c.getState().data;
    const r = buildReport(data, wallMs(clock.wall), c.elapsedAt(clock.read()));
    expect(r.timeline.map((x) => [x.label, x.interval, x.flags])).toEqual([
      ['ROM', '—', []],
      ['Crown', '00:00:10', ['Manual']],
      ['Head', '00:00:10', []],
      ['Body: shoulder', '00:00:00', ['Manual']],
    ]);
    expect(intervalsSincePrevious(data.moments).get(head)).toBe(10_000);
    // Body ties with Head on elapsed; the later capture sequence makes it the newest.
    const live = liveStatus(data.moments);
    expect(live.history.map((m) => m.milestoneCode)).toEqual(['ROM', 'CROWN', 'HEAD', 'BODY']);
    expect(live.current!.id).toBe(body.id);
    expect(live.previous!.id).toBe(head);
  });

  it('L06 a manually added First Cry switches the row like a captured one', async () => {
    const c = await SessionController.start(deps());
    clock.advance(30_000);
    c.addMissedMilestone('CROWN', { mode: 'elapsed', elapsed: '00:00:05' }, '');
    expect(c.getState().rowMode).toBe('all');
    c.addMissedMilestone('FIRST_CRY', { mode: 'elapsed', elapsed: '00:00:20' }, '');
    expect(c.getState().rowMode).toBe('post_first_cry');
    const reloadedBefore = await relaunch(c);
    expect(reloadedBefore.getState().rowMode).toBe('post_first_cry');
    reloadedBefore.showAllMilestones();
    expect(reloadedBefore.getState().rowMode).toBe('all');
    const reloaded = await relaunch(reloadedBefore);
    expect(reloaded.getState().rowMode).toBe('all');
  });

  it('A08 "Other" still adds a plain numbered moment', async () => {
    const c = await SessionController.start(deps());
    clock.advance(5000);
    c.markMoment();
    clock.advance(25_000);
    const r = c.addMissedMoment({ mode: 'elapsed', elapsed: '00:00:10' }, '', null);
    if (!r.ok) throw new Error(r.error);
    expect(c.getState().data.moments.find((x) => x.id === r.id)).toMatchObject({
      kind: 'capture',
      milestoneCode: null,
      source: 'manual',
      momentNumber: 2,
    });
    const report = buildReport(c.getState().data, wallMs(clock.wall), null);
    expect(report.timeline.map((x) => [x.label, x.flags])).toEqual([
      ['Moment 1', []],
      ['Moment 2', ['Manual']],
    ]);
    expect(c.getState().rowMode).toBe('all');
  });

  it('offers every timed milestone except APGAR, in spec order', () => {
    expect(MANUAL_MILESTONE_CODES).toEqual([
      'ROM',
      'CROWN',
      'HEAD',
      'BODY',
      'FIRST_CRY',
      'RESUSCITATE',
      'SEPARATION_GUSH',
      'PLACENTA',
    ]);
  });

  it('L08 flagging the newest milestone rebuilds live status', async () => {
    const c = await SessionController.start(deps());
    c.markMilestone('CROWN');
    clock.advance(30_000);
    const head = c.markMilestone('HEAD');
    expect(liveStatus(c.getState().data.moments).current!.milestoneCode).toBe('HEAD');
    c.setAccidental(head, true);
    expect(liveStatus(c.getState().data.moments).current!.milestoneCode).toBe('CROWN');
  });
});

describe('APGAR (L09, L10)', () => {
  it('stores scores separately with no timed moment and keeps the prior score in history', async () => {
    const c = await SessionController.start(deps());
    c.saveAssessment('one_minute', 0);
    c.saveAssessment('five_minute', 10);
    expect(() => c.saveAssessment('one_minute', 11)).toThrow(RangeError);
    expect(() => c.saveAssessment('one_minute', 7.5)).toThrow(RangeError);
    expect(c.getState().data.moments).toHaveLength(0);
    c.saveAssessment('one_minute', 3);
    const reloaded = await relaunch(c);
    const data = reloaded.getState().data;
    expect(data.assessments.map((a) => [a.assessmentPoint, a.score]).sort()).toEqual([
      ['five_minute', 10],
      ['one_minute', 3],
    ]);
    const hist = data.revisions.filter((r) => r.action === 'assessment');
    expect(hist.map((r) => [r.oldValue, r.newValue])).toEqual([
      [null, '0'],
      [null, '10'],
      ['0', '3'],
    ]);
  });

  it('the database rejects out-of-range scores and duplicates per point', async () => {
    const c = await SessionController.start(deps());
    await expect(
      db.runAsync('INSERT INTO assessments (id, session_id, assessment_point, score) VALUES (?, ?, ?, ?)', [
        'x',
        c.sessionId,
        'one_minute',
        11,
      ]),
    ).rejects.toThrow(/CHECK/);
  });
});

describe('timing reliability', () => {
  it('R02 relaunch within the same boot resumes the anchor exactly', async () => {
    const c = await SessionController.start(deps());
    clock.advance(10_000);
    c.markMoment();
    clock.advance(50_000);
    const reloaded = await relaunch(c);
    expect(reloaded.elapsedAt(clock.read())).toBe(60_000);
    expect(reloaded.getState().data.flags).toHaveLength(0);
  });

  it('R03 a wall clock change keeps elapsed continuous and flags the change', async () => {
    const c = await SessionController.start(deps());
    clock.advance(10_000);
    clock.setWallBy(10 * 60_000);
    const id = c.markMoment();
    const m = c.getState().data.moments.find((x) => x.id === id)!;
    expect(m.originalElapsedMs).toBe(10_000);
    expect(m.snapshot!.wallEpochMs).toBe(clock.wall);
    const flags = c.getState().data.flags;
    expect(flags.map((f) => [f.type, f.momentId])).toEqual([['clock_change', id]]);
    clock.advance(1000);
    clock.setWallBy(-10 * 60_000);
    const reloaded = await relaunch(c);
    expect(reloaded.getState().data.flags.map((f) => f.type)).toEqual(['clock_change', 'clock_change']);
  });

  it('R04 reboot uses the wall checkpoint estimate and flags the interval', async () => {
    const c = await SessionController.start(deps());
    clock.advance(10_000);
    c.markMoment();
    await c.whenSaved();
    clock.reboot(50_000);
    const reloaded = await relaunch(c);
    const flags = reloaded.getState().data.flags;
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe('recovery_estimate');
    expect([flags[0].fromElapsedMs, flags[0].toElapsedMs]).toEqual([10_000, 60_000]);
    expect(reloaded.elapsedAt(clock.read())).toBe(60_000);
    const id = reloaded.markMoment();
    expect(reloaded.getState().data.moments.find((m) => m.id === id)!.timingEstimated).toBe(true);
  });

  it('A09 timezone change keeps each stored offset and continuous elapsed', async () => {
    const c = await SessionController.start(deps());
    clock.advance(10_000);
    const a = c.markMoment();
    clock.advance(10_000);
    clock.timezoneId = 'America/Denver';
    clock.offset = -360;
    const b = c.markMoment();
    const ms = c.getState().data.moments;
    expect(ms.find((m) => m.id === a)!.snapshot!.utcOffsetMinutes).toBe(-420);
    expect(ms.find((m) => m.id === b)!.snapshot!.utcOffsetMinutes).toBe(-360);
    expect(ms.find((m) => m.id === b)!.originalElapsedMs).toBe(20_000);
    expect(c.getState().data.flags.map((f) => f.type)).toEqual(['timezone_change']);
  });

  it('R05 a failed write shows not saved, retries with the original snapshot, and never duplicates', async () => {
    const c = await SessionController.start(deps());
    db.failNext(/INSERT INTO moments/);
    const id = c.markMoment();
    const snap = c.getState().data.moments.find((m) => m.id === id)!.snapshot;
    await c.whenSaved();
    expect(c.getState().queue.failed).toBe(true);
    expect(c.getState().saveStates[id]).toBe('pending');
    const later = c.markMoment();
    clock.advance(5000);
    c.retry();
    await c.whenSaved();
    expect(c.getState().saveStates[id]).toBe('saved');
    expect(c.getState().saveStates[later]).toBe('saved');
    const rows = (await repo.loadSessionData(db, c.sessionId))!.moments;
    expect(rows).toHaveLength(2);
    expect(rows[0].snapshot).toEqual(snap);
  });
});

describe('milestone row (L06)', () => {
  it('switches after First Cry and restores all milestones on request', async () => {
    const c = await SessionController.start(deps());
    expect(c.getState().rowMode).toBe('all');
    c.markMilestone('FIRST_CRY');
    expect(c.getState().rowMode).toBe('post_first_cry');
    c.showAllMilestones();
    expect(c.getState().rowMode).toBe('all');
    c.markMilestone('CROWN');
    expect(c.getState().rowMode).toBe('all');
    const reloaded = await relaunch(c);
    expect(reloaded.getState().rowMode).toBe('all');
    reloaded.markMilestone('FIRST_CRY');
    expect(reloaded.getState().rowMode).toBe('post_first_cry');
  });
});

describe('deletion (A11)', () => {
  it('removes one completed session and leaves others', async () => {
    const a = await SessionController.start(deps());
    a.markMoment();
    a.saveAssessment('one_minute', 5);
    await a.finish();
    const b = await SessionController.start(deps());
    b.markMoment();
    await b.finish();
    await repo.deleteSession(db, a.sessionId);
    expect(await repo.loadSessionData(db, a.sessionId)).toBeNull();
    expect(await db.getAllAsync('SELECT * FROM moments WHERE session_id = ?', [a.sessionId])).toEqual([]);
    expect(await db.getAllAsync('SELECT * FROM assessments WHERE session_id = ?', [a.sessionId])).toEqual([]);
    expect((await repo.loadSessionData(db, b.sessionId))!.moments).toHaveLength(2);
  });
});
