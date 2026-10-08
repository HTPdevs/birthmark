import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { brand, colors } from '@/ui/theme';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function mix(fg: string, bg: string, alpha: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return (
    '#' +
    [1, 3, 5]
      .map((i) => Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha)).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

const WHITE = '#FFFFFF';
const AA_TEXT = 4.5;

describe('brand palette', () => {
  it('matches the brand kit in assets/README.txt', () => {
    const readme = readFileSync(join(__dirname, '..', 'assets', 'README.txt'), 'utf8');
    for (const hex of Object.values(brand)) expect(readme).toContain(hex);
  });

  it('derived tokens are the documented blends of brand colors', () => {
    expect(colors.slate).toBe(mix(brand.espresso, brand.cream, 0.75));
    expect(colors.mist).toBe(mix(brand.sage, brand.cream, 0.12));
    expect(colors.dangerSurface).toBe(mix(brand.rust, brand.cream, 0.06));
  });

  // Every text/background pair the UI and the PDF report actually render.
  const textPairs: [string, string, string][] = [
    ['ink on paper', colors.ink, colors.paper],
    ['ink on mist (pressed rows)', colors.ink, colors.mist],
    ['ink on white (PDF)', colors.ink, WHITE],
    ['paper on ink (primary buttons, milestones)', colors.paper, colors.ink],
    ['slate on paper', colors.slate, colors.paper],
    ['slate on mist', colors.slate, colors.mist],
    ['slate on white (PDF)', colors.slate, WHITE],
    ['onAccent on accent (emergency)', colors.onAccent, colors.accent],
    ['danger on paper', colors.danger, colors.paper],
    ['danger on dangerSurface (Not saved)', colors.danger, colors.dangerSurface],
    ['success on paper (Saved)', colors.success, colors.paper],
  ];

  it.each(textPairs)('%s meets WCAG AA (4.5:1)', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('sage is never used as a text color', () => {
    expect(contrast(brand.sage, brand.cream)).toBeLessThan(AA_TEXT);
    expect(colors.slate).not.toBe(brand.sage);
  });

  it('no old-palette or hard-coded hex colors remain outside theme.ts', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && name !== 'theme.ts') files.push(p);
      }
    };
    walk(join(__dirname, '..', 'src'));
    const offenders = files.filter((f) =>
      /['"`(:\s]#[0-9a-fA-F]{6}\b|rgba?\(\s*\d/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
