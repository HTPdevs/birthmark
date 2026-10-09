import { FULL_ROW, POST_FIRST_CRY_ROW } from '@/domain/types';
import { SCROLL_BUTTON_WIDTH, milestoneRowLayout } from '@/ui/milestoneLayout';
import { TOUCH, space } from '@/ui/theme';

const GAP = space.sm;
const totalWidth = (buttonWidth: number, count: number) => buttonWidth * count + GAP * (count - 1);

describe('milestone row layout (fits the viewport)', () => {
  // Left panel widths: small phone landscape, notched phone landscape, tablet.
  const widths = [292, 368, 418, 600, 1000];
  const counts = [FULL_ROW.length, POST_FIRST_CRY_ROW.length + 1]; // post row adds All milestones

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
