import { SessionController } from '@/domain/sessionController';
import { recordedTotal } from '@/domain/timeline';
import { wallMs } from '@/domain/types';
import { REPORT_FOOTER, buildReport, reportFileName, screenTimeline } from '@/report/reportModel';
import { escapeHtml, renderReportHtml } from '@/report/renderHtml';
import { migrate } from '@/storage/db';
import { listSessions } from '@/storage/repository';

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
    // Recorded time starts at Crown (20 s in), so the 60 s session totals 40 s.
    expect(r.header.totalElapsed).toBe('00:00:40');
    expect(r.header.offsets).toBe('UTC-07:00');
    // Finish rows are not timeline rows; they live in appendix.finishes.
    expect(r.timeline.map((x) => x.label)).toEqual(['Event started: Pushing', 'Crown', 'Head', 'Event ended: Pushing']);
    const head = r.timeline.find((x) => x.label === 'Head')!;
    expect(head.entry).toBe('Crown to Head: 00:00:30');
    expect(head.group).toBe('Pushing');
    expect(r.timeline.find((x) => x.label === 'Crown')!.entry).toBe('Crown');
    // The event started before Crown, so it has no recorded time: a dash, not a negative or a fake 00:00:00.
    expect(r.timeline[0].elapsed).toBe('—');
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
    expect(r.timeline).toEqual([]);
    expect(r.appendix.finishes.map((x) => x.label)).toEqual(['Finished', 'Resumed (gap 00:01:05)', 'Finished']);
    // Session elapsed reached 00:01:20, but nothing was recorded, so there is no total.
    expect(r.header.totalElapsed).toBe('—');
    expect(r.header.revision).toBe(4);
  });

  it('shows the date for cross-midnight records and the offset when it changes (A09)', async () => {
    const c = await SessionController.start(deps());
    clock.advance(10 * 3600_000);
    clock.timezoneId = 'America/Denver';
    clock.offset = -360;
    c.markMoment();
    const r = buildReport(c.getState().data, wallMs(clock.wall), c.elapsedAt(clock.read()));
    expect(r.timeline[0].time).toBe('10-08-2026 01:22:08 UTC-06:00');
    // The only record is the origin, so it reads zero elapsed.
    expect(r.timeline[0].elapsed).toBe('00:00:00');
    expect(r.header.offsets).toBe('UTC-07:00, UTC-06:00');
  });

  it('titles the report with the MM-DD-YYYY session date and drops start and finish times', async () => {
    const c = await SessionController.start(deps());
    clock.advance(30_000);
    const live = buildReport(c.getState().data, wallMs(clock.wall), c.elapsedAt(clock.read()));
    expect(live.header.sessionDate).toBe('10-07-2026');
    expect(live.header.title).toBe('Report for 10-07-2026');
    expect(live.header).not.toHaveProperty('start');
    expect(live.header).not.toHaveProperty('end');
    expect(live.header).not.toHaveProperty('startTime');
    expect(live.header).not.toHaveProperty('endTime');

    clock.advance(10 * 3600_000);
    clock.timezoneId = 'America/Denver';
    clock.offset = -360;
    await c.finish();
    const done = buildReport(c.getState().data, wallMs(clock.wall), null);
    // The finish keeps its own date and offset in the appendix.
    expect(done.appendix.finishes.at(-1)!.time).toBe('10-08-2026 01:22:38 UTC-06:00');
    expect(done.header.generatedAt).toMatch(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/);
    // Change history uses the session start offset (UTC-07:00).
    expect(done.changeHistory[0].changedAt).toBe('10-08-2026 00:22:38');
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

  it('numbers on-screen rows from 1 with no Start row: first entry is a bare name, later ones carry "A to B: HH:MM:SS"', async () => {
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
    expect(screenTimeline(r).map((x) => [x.index, x.entry, x.time, x.momentId !== null])).toEqual([
      [1, 'Crown', '14:22:28', true],
      // The accidental tap in between is excluded and does not split Crown to Head.
      [2, 'Crown to Head: 00:00:30', '14:22:58', true],
    ]);
    // No Start row, no Start-to span, no finish row.
    expect(screenTimeline(r).map((x) => x.entry).join('|')).not.toMatch(/Start|Finish/);
    // Total is finish (60 s) minus Crown (20 s).
    expect(r.header.totalElapsed).toBe('00:00:40');
    // The PDF still gets the full label and capture sequence.
    expect(r.timeline.find((x) => x.entry === 'Crown to Head: 00:00:30')!.label).toBe('Head: Face up');
    expect(r.notes).toEqual(['Head: Face up']);
  });

  it('starts recorded time at the first recorded moment: Crown first makes Crown 00:00:00', async () => {
    const c = await SessionController.start(deps());
    clock.advance(90_000);
    c.markMilestone('CROWN');
    clock.advance(65_000);
    c.markMilestone('HEAD');
    clock.advance(15_000);
    await c.finish();
    const r = buildReport(c.getState().data, wallMs(clock.wall), null);
    expect(r.timeline.map((x) => [x.entry, x.elapsed])).toEqual([
      ['Crown', '00:00:00'],
      ['Crown to Head: 00:01:05', '00:01:05'],
    ]);
    // 170 s session minus the 90 s before Crown.
    expect(r.header.totalElapsed).toBe('00:01:20');
    // Stored values are untouched: still measured from session start.
    expect(c.getState().data.session.finishElapsedMs).toBe(170_000);
  });

  it('counts the active total from now minus the origin', async () => {
    const c = await SessionController.start(deps());
    clock.advance(30_000);
    c.markMilestone('ROM');
    clock.advance(12_000);
    const r = buildReport(c.getState().data, wallMs(clock.wall), c.elapsedAt(clock.read()));
    expect(r.header.totalElapsed).toBe('00:00:12');
  });

  it('ignores accidental taps when choosing the origin', async () => {
    const c = await SessionController.start(deps());
    clock.advance(10_000);
    const acc = c.markMilestone('ROM');
    c.setAccidental(acc, true);
    clock.advance(20_000);
    c.markMilestone('CROWN');
    clock.advance(30_000);
    await c.finish();
    const r = buildReport(c.getState().data, wallMs(clock.wall), null);
    expect(r.header.totalElapsed).toBe('00:00:30');
    expect(r.timeline[0]).toMatchObject({ entry: 'Crown', elapsed: '00:00:00' });
    // The appendix keeps session-start elapsed for the excluded tap.
    expect(r.appendix.excluded[0].elapsed).toBe('00:00:10');
  });

  it('moves the origin when a manual moment is added earlier', async () => {
    const c = await SessionController.start(deps());
    clock.advance(40_000);
    c.markMilestone('CROWN');
    clock.advance(20_000);
    await c.finish();
    expect(c.addMissedMilestone('ROM', { mode: 'elapsed', elapsed: '00:00:10' }, '')).toMatchObject({ ok: true });
    const r = buildReport(c.getState().data, wallMs(clock.wall), null);
    expect(r.timeline.map((x) => [x.entry, x.elapsed])).toEqual([
      ['ROM', '00:00:00'],
      ['ROM to Crown: 00:00:30', '00:00:30'],
    ]);
    expect(r.header.totalElapsed).toBe('00:00:50');
    expect(r.notes).toEqual(['ROM: Manual']);
  });

  it('shows a dash for the total when nothing has been recorded', async () => {
    const c = await SessionController.start(deps());
    clock.advance(45_000);
    await c.finish();
    const r = buildReport(c.getState().data, wallMs(clock.wall), null);
    expect(r.timeline).toEqual([]);
    expect(r.header.totalElapsed).toBe('—');
    expect(r.notes).toEqual([]);
  });

  it('lists one Notes line per entry with a label or flags, label first', async () => {
    const c = await SessionController.start(deps());
    clock.advance(20_000);
    const crown = c.markMilestone('CROWN');
    c.labelMoment(crown, 'note');
    c.correctTime(crown, { mode: 'elapsed', elapsed: '00:00:15' });
    clock.advance(10_000);
    c.markMilestone('HEAD');
    clock.advance(10_000);
    const m = c.markMoment();
    c.labelMoment(m, 'Cord check');
    const r = buildReport(c.getState().data, wallMs(clock.wall), c.elapsedAt(clock.read()));
    expect(screenTimeline(r).map((x) => x.entry)).toEqual([
      'Crown',
      'Crown to Head: 00:00:15',
      'Head to Cord check: 00:00:10',
    ]);
    // Head has neither a label nor flags; a capture's label is its name, so it has none either.
    expect(r.notes).toEqual(['Crown: note, Corrected']);
  });

  it('builds the spec filename', async () => {
    const c = await SessionController.start(deps());
    const name = reportFileName(c.getState().data);
    // The file name stays year first so exported files sort by date.
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

  it('escapes milestone labels in the Entry, Notes, and appendix', async () => {
    const c = await SessionController.start(deps());
    clock.advance(1000);
    c.markMilestone('ROM');
    clock.advance(1000);
    const crown = c.markMilestone('CROWN');
    c.labelMoment(crown, '<b>x</b>');
    const acc = c.markMoment();
    c.labelMoment(acc, '<img src=x>');
    c.setAccidental(acc, true);
    const html = renderReportHtml(buildReport(c.getState().data, wallMs(clock.wall), null));
    expect(html).not.toContain('<b>x</b>');
    expect(html).not.toContain('<img');
    expect(html).toContain('<li>Crown: &lt;b&gt;x&lt;/b&gt;</li>');
    expect(html).toContain('&lt;img src=x&gt;');
  });

  it('mirrors the screen structure: dated title, Entry column, Total time last, Notes after APGAR', async () => {
    const c = await SessionController.start(deps());
    clock.advance(20_000);
    c.markMilestone('ROM');
    clock.advance(30_000);
    const crown = c.markMilestone('CROWN');
    c.labelMoment(crown, 'slow');
    clock.advance(10_000);
    await c.finish();
    const r = buildReport(c.getState().data, wallMs(clock.wall), null);
    const html = renderReportHtml(r);
    expect(html).toContain('<h1>Report for 10-07-2026</h1>');
    expect(html).toContain('<th>#</th><th>Entry</th><th>Time (24h)</th><th>Elapsed</th><th>Group</th>');
    expect(html).not.toContain('Since previous');
    expect(html).not.toMatch(/Start to |Start time|Finish time/);
    expect(html).toContain('<td>ROM to Crown: 00:00:30</td>');
    // Total time closes the timeline table and is finish (60 s) minus ROM (20 s).
    const timelineHtml = html.slice(html.indexOf('<h2>Timeline</h2>'), html.indexOf('<h2>Events</h2>'));
    expect(timelineHtml).toMatch(
      /<td><strong>Total time<\/strong><\/td><td><\/td><td><strong>00:00:40<\/strong><\/td><td><\/td><\/tr>\s*<\/tbody>/,
    );
    // Total time appears once, at the end of the timeline; no Start or End (finish) meta.
    expect(html.match(/Total time/g)).toHaveLength(1);
    expect(html).not.toContain('<dt>Start</dt>');
    expect(html).not.toContain('<dt>End</dt>');
    // Notes sits between APGAR and the appendix.
    const apgar = html.indexOf('<h2>APGAR assessments</h2>');
    const notes = html.indexOf('<h2>Notes</h2>');
    expect(apgar).toBeLessThan(notes);
    expect(notes).toBeLessThan(html.indexOf('<h2>Appendix</h2>'));
    expect(html).toContain('<li>Crown: slow</li>');
    // The audit trail stays: session id, revision, finishes appendix.
    expect(html).toContain(r.header.sessionId);
    expect(html).toContain(`<dt>Report revision</dt><dd>r${r.header.revision}</dd>`);
    expect(html).toContain('<h3>Finishes and resumptions</h3>');
  });

  it('says No notes. when no entry has notes', async () => {
    const c = await SessionController.start(deps());
    c.markMilestone('ROM');
    const html = renderReportHtml(buildReport(c.getState().data, wallMs(clock.wall), null));
    expect(html).toContain('<h2>Notes</h2>\n<p class="empty">No notes.</p>');
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
    // 500 records; the finish boundary moved to the appendix.
    expect(r.timeline).toHaveLength(500);
    expect(r.appendix.finishes).toHaveLength(1);
    const html = renderReportHtml(r);
    expect((html.match(/<tr>/g) ?? []).length).toBeGreaterThanOrEqual(501);
    expect(html).toContain('thead { display: table-header-group; }');
    expect(html).toContain('page-break-inside: avoid');
    expect(html).not.toMatch(/https?:\/\//);
  });
});

describe('history duration', () => {
  it('lists the first recorded moment, skipping accidental taps and following a manual earlier moment', async () => {
    const c = await SessionController.start(deps());
    clock.advance(10_000);
    const acc = c.markMoment();
    c.setAccidental(acc, true);
    clock.advance(20_000);
    c.markMilestone('CROWN');
    clock.advance(30_000);
    await c.finish();
    await c.whenSaved();
    const [summary] = await listSessions(db);
    expect(summary.finishElapsedMs).toBe(60_000);
    expect(summary.firstMomentElapsedMs).toBe(30_000);
    expect(recordedTotal(summary.finishElapsedMs, summary.firstMomentElapsedMs)).toBe(30_000);

    c.addMissedMilestone('ROM', { mode: 'elapsed', elapsed: '00:00:05' }, '');
    await c.whenSaved();
    const [moved] = await listSessions(db);
    expect(moved.firstMomentElapsedMs).toBe(5000);
  });

  it('matches the report origin after a time correction', async () => {
    const c = await SessionController.start(deps());
    clock.advance(40_000);
    const crown = c.markMilestone('CROWN');
    clock.advance(20_000);
    await c.finish();
    c.correctTime(crown, { mode: 'elapsed', elapsed: '00:00:25' });
    await c.whenSaved();
    const [summary] = await listSessions(db);
    expect(summary.firstMomentElapsedMs).toBe(25_000);
    const r = buildReport(c.getState().data, wallMs(clock.wall), null);
    expect(r.header.totalElapsed).toBe('00:00:35');
    expect(recordedTotal(summary.finishElapsedMs, summary.firstMomentElapsedMs)).toBe(35_000);
  });

  it('has no duration when nothing was recorded', async () => {
    const c = await SessionController.start(deps());
    clock.advance(5000);
    await c.finish();
    const [summary] = await listSessions(db);
    expect(summary.firstMomentElapsedMs).toBeNull();
    expect(recordedTotal(summary.finishElapsedMs, summary.firstMomentElapsedMs)).toBeNull();
  });
});
