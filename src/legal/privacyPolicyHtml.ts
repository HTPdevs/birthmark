import { PRIVACY_EFFECTIVE_DATE, PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_TITLE } from './privacyPolicy';
import { escapeHtml, pageShell, paragraph } from './pageShell';

/**
 * The privacy policy as a standalone HTML page: site/privacy-policy/index.html,
 * published by .github/workflows/pages.yml as the public URL for the Play
 * Console and App Store privacy policy fields. Same text as the in-app screen.
 * tests/privacyPolicy.test.ts fails if the committed file drifts; regenerate
 * with UPDATE_PRIVACY_MD=1 npx jest tests/privacyPolicy.test.ts
 */

export function privacyPolicyHtml(): string {
  const sections = PRIVACY_SECTIONS.map(
    (s) => `<h2>${escapeHtml(s.heading)}</h2>\n${s.paragraphs.map(paragraph).join('\n')}`,
  ).join('\n');
  return pageShell(
    PRIVACY_TITLE,
    `<h1>${escapeHtml(PRIVACY_TITLE)}</h1>
<p class="date">Effective ${escapeHtml(PRIVACY_EFFECTIVE_DATE)}</p>
${paragraph(PRIVACY_INTRO)}
${sections}`,
  );
}
