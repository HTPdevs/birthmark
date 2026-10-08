/** Spec palette. Muted text uses slate (#4F5D75), never light gray, on white. */
export const colors = {
  ink: '#2D3142',
  line: '#BFC0C0',
  paper: '#FFFFFF',
  accent: '#EF8354',
  slate: '#4F5D75',
  mist: '#F2F2F2',
  danger: '#B3261E',
  success: '#2E6B3F',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const radius = { sm: 8, md: 12, lg: 16 } as const;

/** Minimum touch target in logical units. */
export const TOUCH = 52;

export const type = {
  tabular: { fontVariant: ['tabular-nums' as const] },
};
