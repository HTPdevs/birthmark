import { colors } from '../ui/theme';
import { PRIVACY_EFFECTIVE_DATE, PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_TITLE } from './privacyPolicy';

/**
 * The privacy policy as a standalone HTML page: site/privacy-policy/index.html,
 * published by .github/workflows/pages.yml as the public URL for the Play
 * Console and App Store privacy policy fields. Same text as the in-app screen.
 * tests/privacyPolicy.test.ts fails if the committed file drifts; regenerate
 * with UPDATE_PRIVACY_MD=1 npx jest tests/privacyPolicy.test.ts
 */

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const EMAIL = /([^\s@]+@[^\s@]+\.[a-z]{2,})/g;

/** Escapes a paragraph and links any email address in it. */
const paragraph = (text: string) =>
  `<p>${escape(text).replace(EMAIL, (m) => `<a href="mailto:${m}">${m}</a>`)}</p>`;

export function privacyPolicyHtml(): string {
  const sections = PRIVACY_SECTIONS.map(
    (s) => `<h2>${escape(s.heading)}</h2>\n${s.paragraphs.map(paragraph).join('\n')}`,
  ).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(PRIVACY_TITLE)}</title>
<style>
body { margin: 0; background: ${colors.paper}; color: ${colors.ink}; font: 17px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 680px; margin: 0 auto; padding: 32px 16px 48px; }
h1 { font-size: 28px; line-height: 1.2; margin: 0 0 4px; }
h2 { font-size: 19px; margin: 28px 0 8px; padding-top: 16px; border-top: 1px solid ${colors.line}; }
p { margin: 0 0 12px; }
.date { color: ${colors.slate}; margin-bottom: 20px; }
a { color: ${colors.ink}; }
</style>
</head>
<body>
<main>
<h1>${escape(PRIVACY_TITLE)}</h1>
<p class="date">Effective ${escape(PRIVACY_EFFECTIVE_DATE)}</p>
${paragraph(PRIVACY_INTRO)}
${sections}
</main>
</body>
</html>
`;
}
