import { FULL_ROW, POST_FIRST_CRY_ROW } from '@/domain/types';
import {
  LABELED_SLOT_MIN,
  SCROLL_BUTTON_WIDTH,
  SINCE_VALUE_MAX,
  SINCE_VALUE_MIN,
  headerShowsLabels,
  milestoneRowItems,
  milestoneRowLayout,
  recordingBands,
  sinceTimerFonts,
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
  it('the clock takes a third of the height normally', () => {
    const { clock, body } = recordingBands(false);
    expect(clock / (clock + body)).toBeCloseTo(1 / 3);
  });

  it('gives the clock a quarter while the label box shows', () => {
    const { clock, body } = recordingBands(true);
    expect(clock / (clock + body)).toBeCloseTo(1 / 4);
  });

  it('a 390pt phone (369 usable) keeps a touch-target milestone row with the label box', () => {
    // Body minus vertical padding, "Time since" block at a 100pt clock, label box ~94, two gaps.
    const usable = 369;
    const { clock, body } = recordingBands(true);
    const bodyHeight = (usable * body) / (clock + body) - 16;
    const f = sinceTimerFonts(100);
    const timer = Math.round(f.label * 1.2) + Math.round(f.value * 1.1);
    expect(bodyHeight - timer - 94 - 16).toBeGreaterThanOrEqual(52);
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

  it('falls back to a default clock size for bad input', () => {
    expect(sinceTimerFonts(Number.NaN)).toEqual(sinceTimerFonts(72));
    expect(sinceTimerFonts(0)).toEqual(sinceTimerFonts(72));
  });
});

describe('History / Finish bar labels', () => {
  it('shows icon and label when each slot is at least LABELED_SLOT_MIN wide', () => {
    expect(headerShowsLabels(LABELED_SLOT_MIN * 2 + space.sm)).toBe(true);
    expect(headerShowsLabels(LABELED_SLOT_MIN * 2 + space.sm - 1)).toBe(false);
  });

  it('844pt phone (750 inside insets) keeps labels; 667pt phone stacks icon over label', () => {
    const bar = (screen: number) => screen * 0.35 - 1 - 2 * space.md;
    expect(headerShowsLabels(bar(750))).toBe(true);
    expect(headerShowsLabels(bar(667))).toBe(false);
    expect(headerShowsLabels(bar(1194))).toBe(true);
  });

  it('shows labels before the bar is measured', () => {
    expect(headerShowsLabels(0)).toBe(true);
  });
});
