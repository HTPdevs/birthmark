import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { EMERGENCY_NUMBER } from '@/domain/emergency';
import { PRIVACY_CONTACT } from '@/legal/privacyPolicy';
import {
  SUPPORT_NOTICE,
  SUPPORT_QUESTIONS,
  SUPPORT_TITLE,
  supportPageHtml,
} from '@/legal/supportPageHtml';

const ROOT = join(__dirname, '..');
const PAGE = join(ROOT, 'site', 'support', 'index.html');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const html = supportPageHtml();

// The Support URL for App Store Connect and the Play Console
// (.github/workflows/pages.yml publishes site/).
describe('support page', () => {
  it('site/support/index.html matches the generated page', () => {
    if (process.env.UPDATE_SUPPORT_PAGE) {
      mkdirSync(join(ROOT, 'site', 'support'), { recursive: true });
      writeFileSync(PAGE, html);
    }
    // On failure: UPDATE_SUPPORT_PAGE=1 npx jest tests/supportPage.test.ts
    expect(readFileSync(PAGE, 'utf8')).toBe(html);
  });

  it('shows a contact address that is the privacy policy contact, as a mailto link', () => {
    expect(html).toContain(`<a href="mailto:${PRIVACY_CONTACT}">${PRIVACY_CONTACT}</a>`);
  });

  it('is titled and lists every question and answer, escaped', () => {
    expect(html).toContain(`<title>${esc(SUPPORT_TITLE)}</title>`);
    for (const q of SUPPORT_QUESTIONS) {
      expect(html).toContain(`<h2>${esc(q.question)}</h2>`);
      expect(html).toContain(esc(q.answer));
    }
  });

  it('links the privacy policy with a relative path that resolves on the published site', () => {
    expect(html).toContain('<a href="../privacy-policy/">');
    expect(read('site/privacy-policy/index.html')).toContain('<title>Birthmark privacy policy</title>');
  });

  it('is self-contained: no scripts and no external requests', () => {
    expect(html).not.toMatch(/<script|<link|<img|@import|url\(|src=|https?:\/\//i);
  });

  it('never claims anonymity or HIPAA approval', () => {
    const text = SUPPORT_QUESTIONS.map((q) => q.answer).join('\n') + SUPPORT_NOTICE;
    expect(text).not.toMatch(/\b(is|are) (anonymous|anonymized|HIPAA[- ]compliant|HIPAA approved)\b/i);
    expect(SUPPORT_NOTICE).toContain('not certified for HIPAA');
  });

  // Each answer names UI the app has. If one of these fails, the app changed
  // and the page has to change with it.
  describe('answers match the app', () => {
    const answers = SUPPORT_QUESTIONS.map((q) => q.answer).join('\n');
    const report = read('src/app/report/[id].tsx');

    it('names the real report buttons', () => {
      for (const label of ['Export PDF', 'Add to timeline', 'Delete session']) {
        expect(answers).toContain(label);
        expect(report).toContain(`label="${label}"`);
      }
    });

    it('names the real finish button', () => {
      expect(answers).toContain('Finish');
      expect(read('src/app/record.tsx')).toContain('label="Finish"');
    });

    it('the clock tap toggles the display format', () => {
      expect(read('src/app/record.tsx')).toContain('onToggle={() => appStore.toggleClockFormat()}');
    });

    it('quotes the recovery flag text exactly', () => {
      expect(answers).toContain('"Timing estimated after recovery"');
      expect(read('src/report/reportModel.ts')).toContain("'Timing estimated after recovery'");
    });

    it('emergency number', () => {
      expect(answers).toContain(`with ${EMERGENCY_NUMBER} entered`);
    });
  });
});
