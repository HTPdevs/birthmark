import { SessionController } from '@/domain/sessionController';
import { wallMs } from '@/domain/types';
import { REPORT_FOOTER, buildReport, reportFileName, screenTimeline } from '@/report/reportModel';
import { escapeHtml, renderReportHtml } from '@/report/renderHtml';
import { migrate } from '@/storage/db';

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

describe('report model', () => {
  it('builds header, timeline, events, untimed APGAR rows, and appendix', async () => {
    const c = await SessionController.start(deps());
    clock.advance(10_000);
    const ev = c.startEvent();
    c.labelEvent(ev, 'Pushing');
    clock.advance(10_000);
    c.markMilestone('CROWN');
    clock.advance(30_000);
    c.markMilestone('HEAD');
    const acc = c.markMoment();
    c.setAccidental(acc, true);
    c.saveAssessment('five_minute', 9);
    clock.advance(10_000);
    await c.finish();

    const r = buildReport(c.getState().data, wallMs(clock.wall), null);
    expect(r.header.start).toBe('2026-10-07 14:22:08');
    expect(r.header.end).toBe('2026-10-07 14:23:08');
    expect(r.header.startTime).toBe('14:22:08');
    expect(r.header.endTime).toBe('14:23:08');
    expect(r.header.totalElapsed).toBe('00:01:00');
    expect(r.header.offsets).toBe('UTC-07:00');
    expect(r.timeline.map((x) => x.label)).toEqual([
      'Event started: Pushing',
      'Crown',
      'Head',
      'Finish time',
      'Event ended: Pushing',
    ]);
    const head = r.timeline.find((x) => x.label === 'Head')!;
    expect(head.interval).toBe('00:00:30');
    expect(head.group).toBe('Pushing');
    expect(r.timeline.find((x) => x.label === 'Crown')!.interval).toBe('—');
    expect(r.events).toEqual([
      { label: 'Pushing', start: '14:22:18', end: '14:23:08', duration: '00:00:50', autoEnded: true },
    ]);
    expect(r.apgar).toEqual([
      { label: '1-minute APGAR', score: 'Not entered' },
      { label: '5-minute APGAR', score: '9' },
    ]);
    expect(r.appendix.excluded.map((x) => x.label)).toEqual(['Moment 1']);
    expect(r.appendix.finishes).toHaveLength(1);
    expect(r.changeHistory.map((x) => x.action)).toEqual([
      'Event label changed',
      'Flagged accidental',
      'APGAR score saved',
      'Session finished',
    ]);
  });

  it('labels the resume gap and shows prior finishes in the appendix', async () => {
    const c = await SessionController.start(deps());
    clock.advance(10_000);
    await c.finish();
    clock.advance(65_000);
    await c.resume();
    clock.advance(5000);
    await c.finish();
    const r = buildReport(c.getState().data, wallMs(clock.wall), null);
    expect(r.timeline.map((x) => x.label)).toContain('Resumed after finish (gap 00:01:05)');
    expect(r.appendix.finishes.map((x) => x.label)).toEqual(['Finished', 'Resumed', 'Finished']);
    expect(r.header.totalElapsed).toBe('00:01:20');
    expect(r.header.revision).toBe(4);
  });

  it('shows the date for cross-midnight records and the offset when it changes (A09)', async () => {
    const c = await SessionController.start(deps());
    clock.advance(10 * 3600_000);
    clock.timezoneId = 'America/Denver';
    clock.offset = -360;
    c.markMoment();
    const r = buildReport(c.getState().data, wallMs(clock.wall), c.elapsedAt(clock.read()));
    expect(r.timeline[0].time).toBe('2026-10-08 01:22:08 UTC-06:00');
    expect(r.timeline[0].elapsed).toBe('10:00:00');
    expect(r.header.offsets).toBe('UTC-07:00, UTC-06:00');
  });

  it('gives time-only start and end for the on-screen header, In progress while active', async () => {
    const c = await SessionController.start(deps());
    clock.advance(30_000);
    const live = buildReport(c.getState().data, wallMs(clock.wall), c.elapsedAt(clock.read()));
    expect(live.header.startTime).toBe('14:22:08');
    expect(live.header.endTime).toBe('In progress');
    expect(live.header.end).toBe('In progress');
    // The PDF keeps the full date and time.
    expect(live.header.start).toBe('2026-10-07 14:22:08');

    // An end past midnight in a new offset shows the end's own local time, no date.
    clock.advance(10 * 3600_000);
    clock.timezoneId = 'America/Denver';
    clock.offset = -360;
    await c.finish();
    const done = buildReport(c.getState().data, wallMs(clock.wall), null);
    expect(done.header.endTime).toBe('01:22:38');
    expect(done.header.end).toBe('2026-10-08 01:22:38');
  });

  it('identifies corrected and manual values with their originals', async () => {
    const c = await SessionController.start(deps());
    clock.advance(20_000);
    const m = c.markMoment();
    c.correctTime(m, { mode: 'elapsed', elapsed: '00:00:15' });
    c.addMissedMoment({ mode: 'elapsed', elapsed: '00:00:05' }, 'Missed', null);
    const r = buildReport(c.getState().data, wallMs(clock.wall), c.elapsedAt(clock.read()));
    expect(r.timeline.map((x) => [x.label, x.flags])).toEqual([
      ['Missed', ['Manual']],
      ['Moment 1', ['Corrected']],
    ]);
    expect(r.appendix.corrected).toEqual([
      { label: 'Moment 1', original: '14:22:28 (00:00:20)', effective: '14:22:23 (00:00:15)', source: 'Corrected' },
      { label: 'Missed', original: 'Not captured (manual entry)', effective: '14:22:13 (00:00:05)', source: 'Manual' },
    ]);
  });

  it('names each on-screen row by the span it closes, after a Start time row', async () => {
    const c = await SessionController.start(deps());
    clock.advance(20_000);
    c.markMilestone('CROWN');
    clock.advance(5000);
    const acc = c.markMoment();
    c.setAccidental(acc, true);
    clock.advance(25_000);
    const head = c.markMilestone('HEAD');
    c.labelMoment(head, 'Face up');
    clock.advance(10_000);
    await c.finish();
    const r = buildReport(c.getState().data, wallMs(clock.wall), null);
    expect(screenTimeline(r).map((x) => [x.index, x.span, x.time, x.elapsed, x.notes, x.momentId !== null])).toEqual([
      [1, 'Start time', '14:22:08', '—', '', false],
      [2, 'Start to Crown', '14:22:28', '00:00:20', '', true],
      // The accidental tap in between is excluded and does not split Crown to Head.
      [3, 'Crown to Head', '14:22:58', '00:00:30', 'Face up', true],
      [4, 'Finish time', '14:23:08', '—', '', false],
    ]);
    // The PDF still gets the full label and capture sequence.
    expect(r.timeline.find((x) => x.span === 'Crown to Head')!.label).toBe('Head: Face up');
  });

  it('puts flags in Notes after the label', async () => {
    const c = await SessionController.start(deps());
    clock.advance(20_000);
    const crown = c.markMilestone('CROWN');
    c.labelMoment(crown, 'note');
    c.correctTime(crown, { mode: 'elapsed', elapsed: '00:00:15' });
    const r = buildReport(c.getState().data, wallMs(clock.wall), c.elapsedAt(clock.read()));
    expect(screenTimeline(r)[1]).toMatchObject({ span: 'Start to Crown', elapsed: '00:00:15', notes: 'note, Corrected' });
  });

  it('builds the spec filename', async () => {
    const c = await SessionController.start(deps());
    const name = reportFileName(c.getState().data);
    expect(name).toMatch(/^Birthmark_2026-10-07_142208_[0-9A-F]{4}_r1\.pdf$/);
  });
});

describe('HTML rendering', () => {
  it('escapes every user-entered value', async () => {
    const c = await SessionController.start(deps());
    const m = c.markMoment();
    c.labelMoment(m, '<script>alert("x")</script> & co');
    const html = renderReportHtml(buildReport(c.getState().data, wallMs(clock.wall), null));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co');
    expect(escapeHtml(`'`)).toBe('&#39;');
  });

  it('uses the device-clock footer on screen and in the PDF', async () => {
    const c = await SessionController.start(deps());
    const r = buildReport(c.getState().data, wallMs(clock.wall), null);
    expect(r.footer).toBe("Times are captured using this device's internal clock, verify for accuracy.");
    expect(r.footer).toBe(REPORT_FOOTER);
    expect(renderReportHtml(r)).toContain(
      '<footer>Times are captured using this device&#39;s internal clock, verify for accuracy.</footer>',
    );
  });

  it('A10 includes all 500 entries with overlapping events, long labels, and corrections', async () => {
    const c = await SessionController.start(deps());
    const e1 = c.startEvent();
    c.startEvent();
    const ids: string[] = [];
    for (let i = 0; i < 496; i++) {
      clock.advance(1000);
      if (i === 200) c.selectEvent(e1);
      ids.push(c.markMoment());
    }
    ids.slice(0, 20).forEach((id, i) => c.labelMoment(id, `${'Long label '.repeat(8)}${i}`));
    c.correctTime(ids[10], { mode: 'elapsed', elapsed: '00:00:02' });
    clock.advance(1000);
    await c.finish();
    const data = c.getState().data;
    expect(data.moments).toHaveLength(501);
    const r = buildReport(data, wallMs(clock.wall), null);
    expect(r.timeline).toHaveLength(501);
    const html = renderReportHtml(r);
    expect((html.match(/<tr>/g) ?? []).length).toBeGreaterThanOrEqual(501);
    expect(html).toContain('thead { display: table-header-group; }');
    expect(html).toContain('page-break-inside: avoid');
    expect(html).not.toMatch(/https?:\/\//);
  });
});
