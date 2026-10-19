import { colors } from '../ui/theme';

/**
 * Shared chrome for the standalone pages under site/ (privacy policy, support),
 * published by .github/workflows/pages.yml. Self-contained: inline CSS, no
 * scripts, no external requests.
 */

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const EMAIL = /([^\s@]+@[^\s@]+\.[a-z]{2,})/g;

/** Escapes a paragraph and links any email address in it. */
export const paragraph = (text: string) =>
  `<p>${escapeHtml(text).replace(EMAIL, (m) => `<a href="mailto:${m}">${m}</a>`)}</p>`;

export function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
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
${body}
</main>
</body>
</html>
`;
}
