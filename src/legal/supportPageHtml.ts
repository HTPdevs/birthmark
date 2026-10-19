import { PRIVACY_CONTACT, PRIVACY_DEVELOPER } from './privacyPolicy';
import { escapeHtml, pageShell, paragraph } from './pageShell';

/**
 * The support page: site/support/index.html, published by
 * .github/workflows/pages.yml as the Support URL for App Store Connect and the
 * Play Console. Contact address comes from the privacy policy so the two never
 * disagree. tests/supportPage.test.ts fails if the committed file drifts;
 * regenerate with UPDATE_SUPPORT_PAGE=1 npx jest tests/supportPage.test.ts
 */

export const SUPPORT_TITLE = 'Birthmark support';

export const SUPPORT_INTRO = `Birthmark is published by ${PRIVACY_DEVELOPER}. For help with the app, a bug report, or a question, email ${PRIVACY_CONTACT}.`;

export const SUPPORT_EMAIL_TIPS =
  'In your email, include your device model, its operating system version, and the Birthmark version. Please do not include names or other identifying details about any birth.';

export type SupportQuestion = { question: string; answer: string };

export const SUPPORT_QUESTIONS: SupportQuestion[] = [
  {
    question: 'How do I export a report?',
    answer:
      'Tap Finish on the recording screen and confirm. The report opens. Tap Export PDF, then choose where to save or share it.',
  },
  {
    question: 'How do I correct a mistake or add a missed moment?',
    answer:
      'Open the report and tap a row to edit it, or tap Add to timeline for a moment you missed. The original capture is kept next to every correction.',
  },
  {
    question: 'Can I change the clock between 24-hour and 12-hour?',
    answer: 'Yes. Tap the clock on the recording screen. Reports always use the 24-hour clock.',
  },
  {
    question: 'What happens if I lock the screen, switch apps, or restart the phone?',
    answer:
      'Elapsed time keeps counting through screen lock, backgrounding, and closing the app, and an active session is waiting when you reopen Birthmark. If the phone restarted during a session, Birthmark estimates the timing from its last saved clock reading and flags it "Timing estimated after recovery" in the PDF appendix.',
  },
  {
    question: 'What does the Emergency button do?',
    answer:
      'After you confirm, it opens your phone app with 911 entered. Your phone app and carrier place the call, not Birthmark, and it needs working phone service. The button does not record anything in your session.',
  },
  {
    question: 'Where is my data, and can you recover it?',
    answer:
      'Sessions are stored only on your device. Birthmark has no accounts and no backend, so we cannot see or recover them. Session data is excluded from device backups, and uninstalling Birthmark removes it.',
  },
  {
    question: 'How do I delete a session?',
    answer:
      'Open the finished session from History, then tap Delete session on its report. This removes the session and its cached exports from the device. It cannot remove PDFs you already saved or shared elsewhere.',
  },
];

export const SUPPORT_NOTICE =
  'Birthmark records observations you choose. It gives no clinical guidance and is not certified for HIPAA or any other medical records standard.';

export function supportPageHtml(): string {
  const questions = SUPPORT_QUESTIONS.map(
    (q) => `<h2>${escapeHtml(q.question)}</h2>\n${paragraph(q.answer)}`,
  ).join('\n');
  return pageShell(
    SUPPORT_TITLE,
    `<h1>${escapeHtml(SUPPORT_TITLE)}</h1>
${paragraph(SUPPORT_INTRO)}
${paragraph(SUPPORT_EMAIL_TIPS)}
${questions}
<h2>Privacy</h2>
<p>Read the <a href="../privacy-policy/">Birthmark privacy policy</a>.</p>
${paragraph(SUPPORT_NOTICE)}`,
  );
}
