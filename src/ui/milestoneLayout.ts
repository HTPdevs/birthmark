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
 * Height of the bottom control row: the milestone buttons on the left and
 * Resuscitate + Emergency on the right, all at MILESTONE_BUTTON_HEIGHT, plus
 * the row's vertical padding (space.sm above and below).
 */
export const BOTTOM_ROW_HEIGHT = MILESTONE_BUTTON_HEIGHT + space.sm * 2;

/**
 * Share of the height above the bottom control row for the full-width clock
 * band versus the "Time since" / latest-capture area under it. With the
 * milestone buttons in the bottom row, that area only holds "Time since"
 * (sized at most ~0.95x the clock font) and the latest capture, so the clock
 * takes half. When an unlabeled capture shows the label box, the clock shrinks
 * to a quarter so the box fits on a ~390pt landscape phone.
 */
export function recordingBands(hasLabelTarget: boolean): { clock: number; body: number } {
  return hasLabelTarget ? { clock: 1, body: 3 } : { clock: 1, body: 1 };
}

/** Floor and ceiling for the "Time since" value, in points. */
export const SINCE_VALUE_MIN = 44;
export const SINCE_VALUE_MAX = 96;
/** Smallest value used when the measured box is too short for SINCE_VALUE_MIN. */
export const SINCE_VALUE_SQUEEZED_MIN = 24;
/** Smallest label size when a long heading has to fit the box width. */
export const SINCE_LABEL_SQUEEZED_MIN = 12;
/**
 * Advance width per character, in em, for the bold tabular "00:00:00" value
 * (digits ~0.6em, colons narrower) and the bold uppercase label (~0.58em
 * measured on iOS, plus the 0.5pt letterSpacing). Both round up so the text
 * never needs native shrinking.
 */
export const SINCE_VALUE_EM = 0.62;
export const SINCE_LABEL_EM = 0.66;
export const SINCE_LABEL_LETTER_SPACING = 0.5;

/** Rendered height of the "Time since" label and value lines (lineHeights 1.2 and 1.1). */
export function sinceTimerHeight({ label, value }: { label: number; value: number }): number {
  return Math.round(label * 1.2) + Math.round(value * 1.1);
}

/** The measured "Time since" box and the strings it shows. Missing or bad numbers are ignored. */
export type SinceBox = { height?: number; width?: number; label?: string; value?: string };

const usable = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n > 0;

/**
 * Font sizes for the "Time since {event}" label and value, derived from the
 * real-time clock's fitted font size so the timer scales with the screen but
 * always reads as secondary: the value is at most 60% of the clock (never more
 * than 80% even at the floor) and the label is 40% of the value.
 *
 * With a measured `box`, both lines are fitted here rather than by
 * adjustsFontSizeToFit: on iOS that shrinks text to a few points when its
 * frame comes back a hair shorter than its lineHeight (84.99998 vs 85). The
 * value shrinks to fit the width and then the height (down to
 * SINCE_VALUE_SQUEEZED_MIN); the label shrinks to fit the width (down to
 * SINCE_LABEL_SQUEEZED_MIN).
 */
export function sinceTimerFonts(clockFontSize: number, box: SinceBox = {}): { label: number; value: number } {
  const clock = Number.isFinite(clockFontSize) && clockFontSize > 0 ? clockFontSize : 72;
  let value = Math.floor(Math.min(Math.max(clock * 0.6, SINCE_VALUE_MIN), SINCE_VALUE_MAX, clock * 0.8));
  const width = usable(box.width) ? box.width : undefined;
  const valueChars = Math.max(box.value?.length ?? 0, 8);
  if (width !== undefined) {
    value = Math.max(SINCE_VALUE_SQUEEZED_MIN, Math.min(value, Math.floor(width / (valueChars * SINCE_VALUE_EM))));
  }
  const labelFor = (v: number) => {
    const base = Math.round(Math.min(Math.max(v * 0.4, 16), 36));
    const chars = box.label?.length ?? 0;
    if (width === undefined || chars === 0) return base;
    const fit = Math.floor((width - chars * SINCE_LABEL_LETTER_SPACING) / (chars * SINCE_LABEL_EM));
    return Math.max(SINCE_LABEL_SQUEEZED_MIN, Math.min(base, fit));
  };
  if (usable(box.height)) {
    while (value > SINCE_VALUE_SQUEEZED_MIN && sinceTimerHeight({ label: labelFor(value), value }) > box.height) {
      value -= 1;
    }
  }
  return { label: labelFor(value), value };
}
