import { FULL_ROW, POST_FIRST_CRY_ROW } from '@/domain/types';
import {
  BOTTOM_ROW_HEIGHT,
  MILESTONE_BUTTON_HEIGHT,
  SCROLL_BUTTON_WIDTH,
  SINCE_VALUE_MAX,
  SINCE_VALUE_MIN,
  SINCE_LABEL_EM,
  SINCE_LABEL_LETTER_SPACING,
  SINCE_LABEL_SQUEEZED_MIN,
  SINCE_VALUE_EM,
  SINCE_VALUE_SQUEEZED_MIN,
  milestoneRowItems,
  milestoneRowLayout,
  recordingBands,
  sinceTimerFonts,
  sinceTimerHeight,
} from '@/ui/milestoneLayout';
import { TOUCH, space } from '@/ui/theme';

const GAP = space.sm;
const totalWidth = (buttonWidth: number, count: number) => buttonWidth * count + GAP * (count - 1);

describe('milestone row layout (fits the viewport)', () => {
  // Left panel widths: small phone landscape, notched phone landscape, tablet.
  const widths = [292, 368, 418, 600, 1000];
  const counts = [milestoneRowItems('all').length, milestoneRowItems('post_first_cry').length];

  it.each(widths.flatMap((w) => counts.map((c) => [w, c])))(
    'width %i with %i buttons: every button fits and meets the touch target',
    (width, count) => {
      const layout = milestoneRowLayout(width, count);
      expect(layout.scroll).toBe(false);
      expect(layout.buttonWidth).not.toBeNull();
      expect(layout.buttonWidth!).toBeGreaterThanOrEqual(TOUCH);
      expect(totalWidth(layout.buttonWidth!, count)).toBeLessThanOrEqual(width);
    },
  );

  it('uses all the space it can (less than one gap plus one px per button left over)', () => {
    const layout = milestoneRowLayout(418, 5);
    expect(418 - totalWidth(layout.buttonWidth!, 5)).toBeLessThan(5);
  });

  it('fits exactly at the touch-target boundary', () => {
    const width = totalWidth(TOUCH, FULL_ROW.length);
    expect(milestoneRowLayout(width, FULL_ROW.length)).toEqual({ scroll: false, buttonWidth: TOUCH });
  });

  it('falls back to scrolling one px below the boundary, never below TOUCH', () => {
    const width = totalWidth(TOUCH, FULL_ROW.length) - 1;
    const layout = milestoneRowLayout(width, FULL_ROW.length);
    expect(layout).toEqual({ scroll: true, buttonWidth: SCROLL_BUTTON_WIDTH });
    expect(layout.buttonWidth).toBeGreaterThanOrEqual(TOUCH);
  });

  it('an unmeasured row reports a fit with no width (flex fills it)', () => {
    expect(milestoneRowLayout(0, 5)).toEqual({ scroll: false, buttonWidth: null });
    expect(milestoneRowLayout(Number.NaN, 5)).toEqual({ scroll: false, buttonWidth: null });
  });

  it('a single button takes the whole row', () => {
    expect(milestoneRowLayout(300, 1)).toEqual({ scroll: false, buttonWidth: 300 });
  });

  it('respects a custom gap and minimum', () => {
    expect(milestoneRowLayout(100, 2, 10, 50)).toEqual({ scroll: true, buttonWidth: Math.max(50, SCROLL_BUTTON_WIDTH) });
    expect(milestoneRowLayout(110, 2, 10, 50)).toEqual({ scroll: false, buttonWidth: 50 });
  });
});

describe('milestone row items (L04, L06)', () => {
  it('L04 full row is exactly ROM, Crown, Head, Body, First Cry, all captures', () => {
    expect(milestoneRowItems('all')).toEqual(FULL_ROW.map((code) => ({ kind: 'milestone', code })));
    expect(FULL_ROW).toEqual(['ROM', 'CROWN', 'HEAD', 'BODY', 'FIRST_CRY']);
  });

  it('L06 after First Cry: Separation Gush, Placenta, APGAR, then Go back', () => {
    expect(milestoneRowItems('post_first_cry')).toEqual([
      { kind: 'milestone', code: 'SEPARATION_GUSH' },
      { kind: 'milestone', code: 'PLACENTA' },
      { kind: 'apgar' },
      { kind: 'back' },
    ]);
    expect(POST_FIRST_CRY_ROW).toEqual(['SEPARATION_GUSH', 'PLACENTA']);
  });

  it('APGAR and Go back are never milestone captures, and Resuscitate is not in the row', () => {
    for (const mode of ['all', 'post_first_cry'] as const) {
      const codes = milestoneRowItems(mode).flatMap((i) => (i.kind === 'milestone' ? [i.code] : []));
      expect(codes).not.toContain('APGAR');
      expect(codes).not.toContain('RESUSCITATE');
    }
  });

  it('the four-button post row fits a small phone left column without scrolling', () => {
    // 667pt iPhone SE landscape: 65% of 667 minus 2 x 16 padding.
    const layout = milestoneRowLayout(Math.floor(667 * 0.65) - 32, milestoneRowItems('post_first_cry').length);
    expect(layout.scroll).toBe(false);
  });
});

describe('recording screen bands', () => {
  it('the clock takes half the height above the bottom row normally', () => {
    const { clock, body } = recordingBands(false);
    expect(clock / (clock + body)).toBeCloseTo(1 / 2);
  });

  it('gives the clock a quarter while the label box shows', () => {
    const { clock, body } = recordingBands(true);
    expect(clock / (clock + body)).toBeCloseTo(1 / 4);
  });

  it('milestone buttons stay at their original 64pt height', () => {
    expect(MILESTONE_BUTTON_HEIGHT).toBe(64);
  });

  it('the bottom row is the milestone height plus 8pt padding above and below', () => {
    expect(BOTTOM_ROW_HEIGHT).toBe(MILESTONE_BUTTON_HEIGHT + 16);
  });

  // Phone landscape heights: iPhone SE (375 - no insets), 390pt notched phone
  // (369 after the home indicator), and a tablet.
  const LABEL_BOX = 94; // meta line, 48pt input, guidance, gaps
  const LATEST = 24 + 46 + 18; // name, captured time, "Since ..." line
  const geometry = (usable: number, labelBox: boolean) => {
    const { clock, body } = recordingBands(labelBox);
    const above = usable - BOTTOM_ROW_HEIGHT;
    const clockBand = (above * clock) / (clock + body);
    const middle = (above * body) / (clock + body) - 16; // middle row vertical padding
    // BigClock: band minus its 8pt padding, font is 90% of that (width rarely binds on phones).
    const clockFont = Math.max(40, (clockBand - 16) * 0.9);
    return { clockFont, middle };
  };

  it.each([
    [375, false],
    [369, false],
    [369, true],
    [744, false],
    [744, true],
  ] as const)('%ipt usable (label box %s): "Time since", label box and latest capture fit', (usable, labelBox) => {
    const { clockFont, middle } = geometry(usable, labelBox);
    const sinceBox = middle - (labelBox ? LABEL_BOX + 8 : 0);
    const fonts = sinceTimerFonts(clockFont, { height: sinceBox });
    expect(sinceTimerHeight(fonts)).toBeLessThanOrEqual(sinceBox);
    expect(fonts.value).toBeGreaterThanOrEqual(SINCE_VALUE_SQUEEZED_MIN);
    expect(middle).toBeGreaterThanOrEqual(LATEST);
  });

  it('a 369pt phone without the label box needs no squeeze: the timer is its unclamped size', () => {
    const { clockFont, middle } = geometry(369, false);
    expect(sinceTimerFonts(clockFont, { height: middle })).toEqual(sinceTimerFonts(clockFont));
  });

  it('the clock band is taller than the old third of the full height on a 369pt phone', () => {
    const { clockFont } = geometry(369, false);
    const oldBand = 369 / 3;
    expect((clockFont / 0.9) + 16).toBeGreaterThan(oldBand);
  });
});

describe('"Time since" font sizes', () => {
  it.each([40, 64, 72, 100, 160, 230, 400])('clock %ipt: value and label stay below the clock', (clock) => {
    const { label, value } = sinceTimerFonts(clock);
    expect(value).toBeLessThan(clock);
    expect(label).toBeLessThan(value);
    expect(value).toBeLessThanOrEqual(SINCE_VALUE_MAX);
  });

  it('is larger than the old fixed 18 / 44 on a landscape phone (clock ~100pt)', () => {
    expect(sinceTimerFonts(100)).toEqual({ label: 24, value: 60 });
  });

  it('keeps the floor when the clock allows it and caps on tablets', () => {
    expect(sinceTimerFonts(72).value).toBe(SINCE_VALUE_MIN);
    expect(sinceTimerFonts(230)).toEqual({ label: 36, value: SINCE_VALUE_MAX });
  });

  it('shrinks the value to fit a measured box, never below the squeezed floor', () => {
    const unclamped = sinceTimerFonts(160);
    expect(sinceTimerHeight(unclamped)).toBeGreaterThan(100);
    const fitted = sinceTimerFonts(160, { height: 100 });
    expect(sinceTimerHeight(fitted)).toBeLessThanOrEqual(100);
    expect(fitted.value).toBeLessThan(unclamped.value);
    // One more point would not fit (the largest value that fits is chosen).
    const next = { value: fitted.value + 1, label: Math.round(Math.min(Math.max((fitted.value + 1) * 0.4, 16), 36)) };
    expect(sinceTimerHeight(next)).toBeGreaterThan(100);
    expect(sinceTimerFonts(160, { height: 10 }).value).toBe(SINCE_VALUE_SQUEEZED_MIN);
  });

  it('a box big enough changes nothing, and missing or bad sizes are ignored', () => {
    const base = sinceTimerFonts(100);
    expect(sinceTimerFonts(100, { height: 500, width: 2000, label: 'TIME SINCE HEAD', value: '00:00:05' })).toEqual(base);
    expect(sinceTimerFonts(100, { height: 0, width: 0 })).toEqual(base);
    expect(sinceTimerFonts(100, { height: Number.NaN, width: Number.NaN, label: 'x'.repeat(80) })).toEqual(base);
  });

  // Estimated rendered widths, using the same per-character factors.
  const valueWidth = (size: number, text: string) => size * Math.max(text.length, 8) * SINCE_VALUE_EM;
  const labelWidth = (size: number, text: string) =>
    text.length * (size * SINCE_LABEL_EM + SINCE_LABEL_LETTER_SPACING);

  it.each([
    [160, 300, '00:00:05'],
    [160, 450, '00:00:05'],
    [230, 450, '123:45:06'], // elapsed can pass 99 hours
    [100, 260, '00:00:05'],
  ])('clock %ipt in a %ipt-wide box: value %s fits the width', (clock, width, value) => {
    const f = sinceTimerFonts(clock, { width, value });
    expect(valueWidth(f.value, value)).toBeLessThanOrEqual(width);
  });

  it('never squeezes the value below its floor, even in a very narrow box', () => {
    expect(sinceTimerFonts(160, { width: 50, value: '00:00:05' }).value).toBe(SINCE_VALUE_SQUEEZED_MIN);
  });

  it('a long heading shrinks the label only, to fit the width', () => {
    const label = 'TIME SINCE SEPARATION GUSH';
    const plain = sinceTimerFonts(160, { width: 450, value: '00:00:05' });
    const long = sinceTimerFonts(160, { width: 450, value: '00:00:05', label });
    expect(long.value).toBe(plain.value);
    expect(long.label).toBeLessThan(plain.label);
    expect(labelWidth(long.label, label)).toBeLessThanOrEqual(450);
    expect(sinceTimerFonts(160, { width: 100, label }).label).toBe(SINCE_LABEL_SQUEEZED_MIN);
  });

  it('fits width and height together on the measured iPhone box (451 x 126)', () => {
    const box = { width: 451, height: 126, label: 'TIME SINCE HEAD', value: '00:00:05' };
    const f = sinceTimerFonts(128.4, box);
    expect(f).toEqual({ label: 31, value: 77 });
    expect(sinceTimerHeight(f)).toBeLessThanOrEqual(box.height);
    expect(valueWidth(f.value, box.value)).toBeLessThanOrEqual(box.width);
    expect(labelWidth(f.label, box.label)).toBeLessThanOrEqual(box.width);
  });

  it('falls back to a default clock size for bad input', () => {
    expect(sinceTimerFonts(Number.NaN)).toEqual(sinceTimerFonts(72));
    expect(sinceTimerFonts(0)).toEqual(sinceTimerFonts(72));
  });
});
