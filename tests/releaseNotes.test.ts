import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { milestoneLabel } from '@/domain/types';
import { milestoneRowItems } from '@/ui/milestoneLayout';

// Play Console "What's new" notes: one <locale>...</locale> block per language,
// at most 500 characters each (whitespace and newlines count). An over-limit
// locale rejects the whole release.
const DIR = join(__dirname, '..', 'docs', 'release-notes');
const PLAY_LIMIT = 500;

const files = readdirSync(DIR).filter((f) => f.endsWith('.txt'));

function locales(text: string): { tag: string; body: string }[] {
  return [...text.matchAll(/<([a-z]{2,3}-[A-Z]{2})>\n([\s\S]*?)\n<\/\1>/g)].map((m) => ({ tag: m[1], body: m[2] }));
}

describe('Google Play release notes', () => {
  it('has a notes file for the app.json version', () => {
    const { version } = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8')).expo;
    expect(files).toContain(`${version}.txt`);
  });

  it.each(files)('%s: every locale is within the Play limit', (file) => {
    const text = readFileSync(join(DIR, file), 'utf8');
    const blocks = locales(text);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.map((b) => b.tag)).toContain('en-US');
    // Nothing outside the locale tags: Play would reject or show it.
    expect(text.replace(/<([a-z]{2,3}-[A-Z]{2})>\n[\s\S]*?\n<\/\1>/g, '').trim()).toBe('');
    for (const b of blocks) expect([...b.body].length).toBeLessThanOrEqual(PLAY_LIMIT);
  });

  it('1.0.0 lists the milestone buttons the app actually has, in row order', () => {
    const text = readFileSync(join(DIR, '1.0.0.txt'), 'utf8');
    const listed = text.match(/one tap: (.*)\n/)![1].split(', ');
    const row = [...milestoneRowItems('all'), ...milestoneRowItems('post_first_cry')].flatMap((i) =>
      i.kind === 'milestone' ? [milestoneLabel(i.code)] : [],
    );
    expect(listed).toEqual(row);
  });
});
