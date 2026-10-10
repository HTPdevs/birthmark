/**
 * Privacy policy text. Single source for the in-app Privacy screen and
 * docs/privacy-policy.md (the copy hosted for the Play Console URL field).
 * tests/privacyPolicy.test.ts fails when the two drift, and checks each claim
 * below against the code and config it describes. Change the text here, then
 * regenerate the doc: UPDATE_PRIVACY_MD=1 npx jest tests/privacyPolicy.test.ts
 */

export const PRIVACY_DEVELOPER = 'HTPdevs';
export const PRIVACY_CONTACT = 'support@htpdevs.tech';
/** ISO date. Bump it whenever the text changes. */
export const PRIVACY_EFFECTIVE_DATE = '2026-10-10';

export type PolicySection = { heading: string; paragraphs: string[] };

export const PRIVACY_TITLE = 'Birthmark privacy policy';

export const PRIVACY_INTRO = `This policy explains how the Birthmark app, published by ${PRIVACY_DEVELOPER}, handles information. Birthmark works offline on one device. It has no accounts, no backend server, no advertising, and no analytics.`;

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    heading: 'What the app stores',
    paragraphs: [
      'Birthmark stores what you record during a session: the time of each captured moment, milestone names, optional labels you type (up to 80 characters), event timers, APGAR scores, corrections and their history, and timing details from the device clock (timezone, UTC offset, and a boot identifier used to recover elapsed time after a restart). It also stores your 12-hour or 24-hour clock display preference.',
      'Birthmark does not ask for names, dates of birth, addresses, medical record numbers, or any patient profile. A label is free text, so it can still contain identifying details if you type them. Do not enter names or identifying details in labels.',
    ],
  },
  {
    heading: 'Where it is stored',
    paragraphs: [
      'All records are kept in a database inside the app on this device. Birthmark does not send session data to HTPdevs or to anyone else, and it has no account or cloud sync.',
      'Session data is excluded from automatic device backups: Android app backup is turned off, and on iOS the database folder is excluded from iCloud and computer backups.',
    ],
  },
  {
    heading: 'What the app does not use',
    paragraphs: [
      'Birthmark does not use the microphone, camera, location, contacts, or photos. It does not record audio. It contains no advertising, analytics, crash-reporting, or tracking services.',
    ],
  },
  {
    heading: 'Exported reports',
    paragraphs: [
      "When you export a report, Birthmark creates a PDF on the device and opens your device's share sheet. You choose where it goes, for example a file location or another app. Nothing is sent automatically.",
      "Once you save or share a PDF outside Birthmark, that copy is handled by the destination you chose and its own privacy terms. Deleting a session in Birthmark cannot remove copies saved elsewhere. Birthmark clears its own cached export files when a session is deleted.",
    ],
  },
  {
    heading: 'Emergency button',
    paragraphs: [
      "After you confirm, the Emergency button opens your device's phone app with 911 entered. The call is placed by your phone app and carrier, not by Birthmark. Birthmark does not record that you used it.",
    ],
  },
  {
    heading: 'Keeping and deleting data',
    paragraphs: [
      'Records stay on the device until you delete them. You can delete a finished session from its report. This removes its database records and cached exports. Uninstalling Birthmark removes all of its data from the device.',
    ],
  },
  {
    heading: 'Security and medical use',
    paragraphs: [
      'Records are protected by the security of your device, such as its screen lock. Birthmark does not make records anonymous, and it is not certified for HIPAA or any other medical records standard. It records observations you choose and gives no clinical guidance.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      'If this policy changes, the updated version will ship in the app with a new effective date.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [`Questions about this policy: ${PRIVACY_CONTACT}`],
  },
];

/** The policy as Markdown, for docs/privacy-policy.md. */
export function privacyPolicyMarkdown(): string {
  const parts = [
    `# ${PRIVACY_TITLE}`,
    `Effective ${PRIVACY_EFFECTIVE_DATE}`,
    PRIVACY_INTRO,
    ...PRIVACY_SECTIONS.flatMap((s) => [`## ${s.heading}`, ...s.paragraphs]),
  ];
  return parts.join('\n\n') + '\n';
}
