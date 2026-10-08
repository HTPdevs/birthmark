/** Brand kit colors (assets/README.txt). Use the role tokens in `colors`, not these. */
export const brand = {
  espresso: '#3B2A24',
  coral: '#E8775A',
  rust: '#B4472C',
  cream: '#FAF3EC',
  sage: '#8FA89A',
} as const;

/**
 * Role tokens. Muted text is a darkened espresso (#6B5C56), never sage:
 * sage on cream is 2.3:1 and fails as text. Contrast is checked in
 * tests/palette.test.ts.
 */
export const colors = {
  ink: brand.espresso,
  line: brand.sage,
  paper: brand.cream,
  accent: brand.coral,
  /** Text on `accent` (emergency button). */
  onAccent: brand.espresso,
  /** Secondary text: espresso at 75% over cream. */
  slate: '#6B5C56',
  /** Muted surface: sage at 12% over cream. */
  mist: '#EDEAE2',
  danger: brand.rust,
  /** Failed-save pill: rust at 6% over cream. */
  dangerSurface: '#F6E9E0',
  success: '#2E6B3F',
  /** Modal backdrop: espresso at 45%. */
  scrim: 'rgba(59,42,36,0.45)',
  /** Scroll cue fade over the milestone row: cream at 85%. */
  fade: 'rgba(250,243,236,0.85)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const radius = { sm: 8, md: 12, lg: 16 } as const;

/** Minimum touch target in logical units. */
export const TOUCH = 52;

export const type = {
  tabular: { fontVariant: ['tabular-nums' as const] },
};
