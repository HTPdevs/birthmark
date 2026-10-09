import { SessionController } from '@/domain/sessionController';
import { effectiveElapsed, effectiveWall } from '@/domain/timeline';
import { migrate } from '@/storage/db';
import { draftAt, draftToInput } from '@/ui/manualTimeDraft';
import { recordingOrigin } from '@/domain/timeline';

import { FakeClock, T0, uuid } from './helpers/fakeClock';
import { type TestDb, openTestDb } from './helpers/sqlite';

let db: TestDb;
let clock: FakeClock;
const deps = () => ({ db, clock, uuid });
/** Device zone fixed at UTC-07:00 (getTimezoneOffset is minutes west). */
const PDT = () => 420;
/** Device zone fixed at UTC-06:00, a device that moved after the session started. */
const MDT = () => 360;

beforeEach(async () => {
  db = openTestDb();
  await migrate(db);
  clock = new FakeClock();
});

describe('manual time draft (MM-DD-YYYY, device time zone)', () => {
  it('prefills date as MM-DD-YYYY and time in the device zone', () => {
    expect(draftAt(T0 + 60_000, 60_000, PDT)).toEqual({
      mode: 'elapsed',
      elapsed: '00:01:00',
      date: '10-07-2026',
      time: '14:23:08',
    });
    expect(draftAt(T0, 0, MDT).time).toBe('15:22:08');
  });

  it('converts date and time with the device offset and no offset field', () => {
    const d = { ...draftAt(T0, 0, PDT), mode: 'clock' as const, time: '14:22:38' };
    expect(draftToInput(d, PDT)).toEqual({ mode: 'clock', date: '2026-10-07', time: '14:22:38', offsetMinutes: -420 });
    expect(draftToInput({ ...d, mode: 'elapsed', elapsed: '00:00:30' }, PDT)).toEqual({ mode: 'elapsed', elapsed: '00:00:30' });
  });

  it('explains bad dates and times in the new format', () => {
    const d = { ...draftAt(T0, 0, PDT), mode: 'clock' as const };
    expect(draftToInput({ ...d, date: '2026-10-07' }, PDT)).toEqual({ error: 'Enter the date as MM-DD-YYYY.' });
    expect(draftToInput({ ...d, date: '02-30-2026' }, PDT)).toEqual({ error: 'Enter the date as MM-DD-YYYY.' });
    expect(draftToInput({ ...d, time: '2:22' }, PDT)).toEqual({ error: 'Enter the time as HH:mm:ss (24-hour).' });
  });

  it('corrects a capture through Save and update', async () => {
    const c = await SessionController.start(deps());
    clock.advance(60_000);
    c.markMilestone('CROWN');
    const crown = c.getState().data.moments.find((m) => m.milestoneCode === 'CROWN')!;
    const draft = { ...draftAt(effectiveWall(crown)!, effectiveElapsed(crown), PDT), mode: 'clock' as const, time: '14:22:38' };
    const input = draftToInput(draft, PDT);
    if ('error' in input) throw new Error(input.error);
    expect(c.correctTime(crown.id, input).ok).toBe(true);
    const after = c.getState().data.moments.find((m) => m.id === crown.id)!;
    expect(effectiveElapsed(after)).toBe(30_000);
  });

  it('saving the prefilled values unchanged keeps the instant, even in another zone', async () => {
    const c = await SessionController.start(deps());
    clock.advance(90_000);
    c.markMilestone('HEAD');
    const head = c.getState().data.moments.find((m) => m.milestoneCode === 'HEAD')!;
    const draft = { ...draftAt(effectiveWall(head)!, effectiveElapsed(head), MDT), mode: 'clock' as const };
    const input = draftToInput(draft, MDT);
    if ('error' in input) throw new Error(input.error);
    expect(c.correctTime(head.id, input).ok).toBe(true);
    const after = c.getState().data.moments.find((m) => m.id === head.id)!;
    expect(effectiveElapsed(after)).toBe(90_000);
    expect(effectiveWall(after)).toBe(T0 + 90_000);
  });

  describe('elapsed counts from the first recorded moment, as in the report', () => {
    it('shows the first recorded moment as 00:00:00, not its time since Start', async () => {
      const c = await SessionController.start(deps());
      clock.advance(90_000);
      c.markMilestone('CROWN');
      const moments = c.getState().data.moments;
      const crown = moments.find((m) => m.milestoneCode === 'CROWN')!;
      const origin = recordingOrigin(moments)!;
      expect(origin).toBe(90_000);
      expect(draftAt(effectiveWall(crown)!, effectiveElapsed(crown), PDT, origin).elapsed).toBe('00:00:00');
    });

    it('an elapsed entry is shifted back to time since Start before it is stored', async () => {
      const c = await SessionController.start(deps());
      clock.advance(90_000);
      c.markMilestone('CROWN');
      clock.advance(60_000);
      c.markMilestone('HEAD');
      const moments = c.getState().data.moments;
      const head = moments.find((m) => m.milestoneCode === 'HEAD')!;
      const origin = recordingOrigin(moments)!;
      const draft = draftAt(effectiveWall(head)!, effectiveElapsed(head), PDT, origin);
      expect(draft.elapsed).toBe('00:01:00');
      const input = draftToInput({ ...draft, elapsed: '00:00:30' }, PDT, origin);
      expect(input).toEqual({ mode: 'elapsed', elapsed: '00:02:00' });
      if ('error' in input) throw new Error(input.error);
      expect(c.correctTime(head.id, input).ok).toBe(true);
      const after = c.getState().data.moments.find((m) => m.id === head.id)!;
      // Head now reads 30 s after Crown in the report.
      expect(effectiveElapsed(after) - recordingOrigin(c.getState().data.moments)!).toBe(30_000);
    });

    it('saving the prefilled elapsed unchanged keeps the instant', async () => {
      const c = await SessionController.start(deps());
      clock.advance(90_000);
      c.markMilestone('CROWN');
      clock.advance(45_000);
      c.markMilestone('HEAD');
      const moments = c.getState().data.moments;
      const head = moments.find((m) => m.milestoneCode === 'HEAD')!;
      const origin = recordingOrigin(moments)!;
      const input = draftToInput(draftAt(effectiveWall(head)!, effectiveElapsed(head), PDT, origin), PDT, origin);
      if ('error' in input) throw new Error(input.error);
      expect(c.correctTime(head.id, input).ok).toBe(true);
      expect(effectiveElapsed(c.getState().data.moments.find((m) => m.id === head.id)!)).toBe(135_000);
    });

    it('passes unparseable elapsed text through so the domain reports the error', () => {
      const d = draftAt(T0, 0, PDT, 90_000);
      expect(draftToInput({ ...d, elapsed: 'abc' }, PDT, 90_000)).toEqual({ mode: 'elapsed', elapsed: 'abc' });
    });

    it('with no recorded moment the origin is Start', () => {
      expect(draftAt(T0 + 60_000, 60_000, PDT).elapsed).toBe('00:01:00');
      const d = draftAt(T0, 0, PDT);
      expect(draftToInput({ ...d, elapsed: '00:00:30' }, PDT)).toEqual({ mode: 'elapsed', elapsed: '00:00:30' });
    });
  });
});
