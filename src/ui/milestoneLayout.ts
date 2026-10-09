import { TOUCH, space } from './theme';

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
