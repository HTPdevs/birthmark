import {
  CLOCK_CHANGE_THRESHOLD_MS,
  anchorFromSnapshot,
  checkpointFromSnapshot,
  computeElapsed,
  detectClockChanges,
  formatElapsed,
  formatTime12,
  formatTime24,
  isSameBoot,
  parseElapsed,
  parseLocalDateTime,
  parseOffset,
  resolveAnchor,
} from '@/domain/time';
import { elapsedMs } from '@/domain/types';

import { FakeClock, T0 } from './helpers/fakeClock';

describe('elapsed from anchor', () => {
  it('recomputes from the anchor instead of accumulating', () => {
    const c = new FakeClock();
    const anchor = anchorFromSnapshot(c.read(), elapsedMs(0));
    c.advance(5 * 60_000);
    expect(computeElapsed(anchor, c.read())).toBe(5 * 60_000);
  });

  it('includes device sleep and ignores wall clock changes (R01, R03)', () => {
    const c = new FakeClock();
    const anchor = anchorFromSnapshot(c.read(), elapsedMs(1000));
    c.advance(10_000);
    c.setWallBy(-10 * 60_000);
    expect(computeElapsed(anchor, c.read())).toBe(11_000);
  });

  it('can exceed 24 hours', () => {
    expect(formatElapsed(25 * 3600_000 + 61_000)).toBe('25:01:01');
  });
});

describe('boot verification', () => {
  it('accepts the same boot id with a forward clock', () => {
    const c = new FakeClock();
    const anchor = anchorFromSnapshot(c.read(), elapsedMs(0));
    c.advance(1);
    expect(isSameBoot(anchor, c.read())).toBe(true);
  });

  it('rejects a different boot, a backwards clock, or an unknown boot id', () => {
    const c = new FakeClock();
    const anchor = anchorFromSnapshot(c.read(), elapsedMs(0));
    c.reboot(60_000);
    expect(isSameBoot(anchor, c.read())).toBe(false);

    const c2 = new FakeClock();
    const a2 = anchorFromSnapshot(c2.read(), elapsedMs(0));
    c2.cont -= 1;
    expect(isSameBoot(a2, c2.read())).toBe(false);

    const c3 = new FakeClock();
    c3.bootId = null;
    const a3 = anchorFromSnapshot(c3.read(), elapsedMs(0));
    expect(isSameBoot(a3, c3.read())).toBe(false);
  });
});

describe('recovery (R02, R04)', () => {
  it('keeps the anchor within the same boot', () => {
    const c = new FakeClock();
    const s0 = c.read();
    const anchor = anchorFromSnapshot(s0, elapsedMs(0));
    c.advance(90_000);
    const r = resolveAnchor(anchor, checkpointFromSnapshot(s0, elapsedMs(0)), c.read());
    expect(r.kind).toBe('same_boot');
    expect(r.elapsed).toBe(90_000);
  });

  it('estimates from the wall checkpoint after a reboot and marks the anchor estimated', () => {
    const c = new FakeClock();
    const s0 = c.read();
    const anchor = anchorFromSnapshot(s0, elapsedMs(0));
    c.advance(60_000);
    const checkpoint = checkpointFromSnapshot(c.read(), elapsedMs(60_000));
    c.reboot(120_000);
    const r = resolveAnchor(anchor, checkpoint, c.read());
    expect(r.kind).toBe('estimated');
    if (r.kind !== 'estimated') return;
    expect(r.fromElapsedMs).toBe(60_000);
    expect(r.toElapsedMs).toBe(180_000);
    expect(r.anchor.estimated).toBe(true);
    c.advance(1000);
    expect(computeElapsed(r.anchor, c.read())).toBe(181_000);
  });
});

describe('clock change detection', () => {
  it('flags drift strictly over 2 seconds', () => {
    const c = new FakeClock();
    const cp = checkpointFromSnapshot(c.read(), elapsedMs(0));
    c.advance(1000);
    c.setWallBy(CLOCK_CHANGE_THRESHOLD_MS);
    expect(detectClockChanges(cp, c.read())).toEqual([]);
    c.setWallBy(1);
    const flags = detectClockChanges(cp, c.read());
    expect(flags.map((f) => f.type)).toEqual(['clock_change']);
  });

  it('flags timezone and offset changes separately', () => {
    const c = new FakeClock();
    const cp = checkpointFromSnapshot(c.read(), elapsedMs(0));
    c.advance(1000);
    c.timezoneId = 'America/Denver';
    c.offset = -360;
    expect(detectClockChanges(cp, c.read()).map((f) => f.type)).toEqual(['timezone_change']);
  });
});

describe('formatting (L03)', () => {
  const offset = -420;
  const at = (h: number, m: number, s: number) => Date.UTC(2026, 9, 7, h, m, s) - offset * 60_000;

  it('shows 24-hour time by default', () => {
    expect(formatTime24(T0, offset)).toBe('14:22:08');
  });

  it('handles noon and midnight in 12-hour mode', () => {
    expect(formatTime12(at(0, 0, 5), offset)).toBe('12:00:05 AM');
    expect(formatTime12(at(12, 0, 5), offset)).toBe('12:00:05 PM');
    expect(formatTime12(at(23, 59, 59), offset)).toBe('11:59:59 PM');
    expect(formatTime24(at(0, 0, 5), offset)).toBe('00:00:05');
  });
});

describe('parsing manual input', () => {
  it('parses elapsed values', () => {
    expect(parseElapsed('01:02:03')).toBe(3_723_000);
    expect(parseElapsed('26:00:00')).toBe(93_600_000);
    expect(parseElapsed('1:60:00')).toBeNull();
    expect(parseElapsed('abc')).toBeNull();
  });

  it('parses local date and time at an offset and rejects invalid dates', () => {
    expect(parseLocalDateTime('2026-10-07', '14:22:08', -420)).toBe(T0);
    expect(parseLocalDateTime('2026-02-30', '10:00:00', 0)).toBeNull();
    expect(parseLocalDateTime('2026-10-07', '24:00:00', 0)).toBeNull();
  });

  it('parses offsets', () => {
    expect(parseOffset('-07:00')).toBe(-420);
    expect(parseOffset('UTC+05:30')).toBe(330);
    expect(parseOffset('+15:00')).toBeNull();
  });
});
