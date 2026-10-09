import type { RowMode } from '../domain/timeline';
import { FULL_ROW, POST_FIRST_CRY_ROW, type RowMilestoneCode } from '../domain/types';
import { TOUCH, space } from './theme';

/** Milestone button height: the original size, not stretched to fill the column. */
export const MILESTONE_BUTTON_HEIGHT = 64;

/** Button width for the milestone row when it has to scroll. */
export const SCROLL_BUTTON_WIDTH = Math.round(TOUCH * 1.6);

export type MilestoneRowLayout =
  /** Every button fits in the row. `buttonWidth` is null until the row is measured. */
  | { scroll: false; buttonWidth: number | null }
  /** Fitting would drop below TOUCH, so the row scrolls with fixed-width buttons. */
  | { scroll: true; buttonWidth: number };

/**
 * Sizes `count` milestone buttons to share `rowWidth` with `gap` between them,
 * so every button is visible without sliding. Falls back to a scrolling row only
 * when the shared width would drop below the minimum touch target.
 *
 * Widths are floored so rounding never pushes the last button out of the row.
 * A rowWidth of 0 or less means the row is not measured yet: report a fit with
 * no width and let flex layout share the space for that first frame.
 */
export function milestoneRowLayout(
  rowWidth: number,
  count: number,
  gap: number = space.sm,
  minWidth: number = TOUCH,
): MilestoneRowLayout {
  if (!(rowWidth > 0) || count <= 0) return { scroll: false, buttonWidth: null };
  const fitWidth = Math.floor((rowWidth - gap * (count - 1)) / count);
  if (fitWidth >= minWidth) return { scroll: false, buttonWidth: fitWidth };
  return { scroll: true, buttonWidth: Math.max(minWidth, SCROLL_BUTTON_WIDTH) };
}

/**
 * One entry in the milestone row. Only `milestone` records a moment; `apgar`
 * opens the APGAR editor and `back` restores the full row.
 */
export type MilestoneRowItem =
  | { kind: 'milestone'; code: RowMilestoneCode }
  | { kind: 'apgar' }
  | { kind: 'back' };

/**
 * The row's buttons in display order. The full row is ROM, Crown, Head, Body,
 * First Cry. After First Cry it is Separation Gush, Placenta, APGAR, then
 * Go back (which restores the full row).
 */
export function milestoneRowItems(mode: RowMode): MilestoneRowItem[] {
  if (mode === 'all') return FULL_ROW.map((code) => ({ kind: 'milestone', code }));
  return [
    ...POST_FIRST_CRY_ROW.map((code): MilestoneRowItem => ({ kind: 'milestone', code })),
    { kind: 'apgar' },
    { kind: 'back' },
  ];
}

/**
 * Share of the recording screen's height for the full-width clock band versus
 * the area under it. The clock takes a third. When an unlabeled capture shows
 * the label box, the clock shrinks to a fifth so the full-height milestone
 * buttons (MILESTONE_BUTTON_HEIGHT) still fit on a ~390pt landscape phone.
 */
export function recordingBands(hasLabelTarget: boolean): { clock: number; body: number } {
  return hasLabelTarget ? { clock: 1, body: 4 } : { clock: 1, body: 2 };
}

/** Floor and ceiling for the "Time since" value, in points. */
export const SINCE_VALUE_MIN = 44;
export const SINCE_VALUE_MAX = 96;

/**
 * Font sizes for the "Time since {event}" label and value, derived from the
 * real-time clock's fitted font size so the timer scales with the screen but
 * always reads as secondary: the value is at most 60% of the clock (never more
 * than 80% even at the floor) and the label is 40% of the value.
 */
export function sinceTimerFonts(clockFontSize: number): { label: number; value: number } {
  const clock = Number.isFinite(clockFontSize) && clockFontSize > 0 ? clockFontSize : 72;
  const value = Math.floor(
    Math.min(Math.max(clock * 0.6, SINCE_VALUE_MIN), SINCE_VALUE_MAX, clock * 0.8),
  );
  const label = Math.round(Math.min(Math.max(value * 0.4, 16), 36));
  return { label, value };
}
