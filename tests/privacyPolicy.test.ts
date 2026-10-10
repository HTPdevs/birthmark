import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { EMERGENCY_NUMBER } from '@/domain/emergency';
import { LABEL_MAX_LENGTH } from '@/domain/types';
import {
  PRIVACY_CONTACT,
  PRIVACY_DEVELOPER,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_INTRO,
  PRIVACY_SECTIONS,
  privacyPolicyMarkdown,
} from '@/legal/privacyPolicy';
import { privacyPolicyHtml } from '@/legal/privacyPolicyHtml';

const ROOT = join(__dirname, '..');
const DOC = join(ROOT, 'docs', 'privacy-policy.md');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const fullText = [PRIVACY_INTRO, ...PRIVACY_SECTIONS.flatMap((s) => s.paragraphs)].join('\n');

describe('privacy policy', () => {
  it('docs/privacy-policy.md matches the in-app text', () => {
    const md = privacyPolicyMarkdown();
    if (process.env.UPDATE_PRIVACY_MD) writeFileSync(DOC, md);
    // On failure: UPDATE_PRIVACY_MD=1 npx jest tests/privacyPolicy.test.ts
    expect(readFileSync(DOC, 'utf8')).toBe(md);
  });

  // The public URL for the store listings (GitHub Pages, .github/workflows/pages.yml).
  describe('published page', () => {
    const PAGE = join(ROOT, 'site', 'privacy-policy', 'index.html');
    const html = privacyPolicyHtml();

    it('site/privacy-policy/index.html matches the in-app text', () => {
      if (process.env.UPDATE_PRIVACY_MD) {
        mkdirSync(join(ROOT, 'site', 'privacy-policy'), { recursive: true });
        writeFileSync(PAGE, html);
      }
      // On failure: UPDATE_PRIVACY_MD=1 npx jest tests/privacyPolicy.test.ts
      expect(readFileSync(PAGE, 'utf8')).toBe(html);
    });

    it('contains every heading and paragraph, escaped', () => {
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      for (const s of PRIVACY_SECTIONS) {
        expect(html).toContain(`<h2>${esc(s.heading)}</h2>`);
        for (const p of s.paragraphs) expect(html).toContain(esc(p).replace(PRIVACY_CONTACT, ''));
      }
      expect(html).toContain(`<a href="mailto:${PRIVACY_CONTACT}">${PRIVACY_CONTACT}</a>`);
      expect(html).toContain(`Effective ${PRIVACY_EFFECTIVE_DATE}`);
    });

    it('is self-contained: no scripts and no external requests', () => {
      expect(html).not.toMatch(/<script|<link|<img|@import|url\(|src=|https?:\/\//i);
    });

    it('site root redirects to the policy', () => {
      expect(read('site/index.html')).toContain('url=privacy-policy/');
    });
  });

  // Google Play User Data policy: the policy must name the developer and a
  // privacy point of contact.
  it('names the developer and a contact address', () => {
    expect(PRIVACY_DEVELOPER).toBe('HTPdevs');
    expect(PRIVACY_CONTACT).toMatch(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/);
    expect(fullText).toContain(PRIVACY_DEVELOPER);
    expect(fullText).toContain(PRIVACY_CONTACT);
  });

  it('effective date is a real ISO date', () => {
    expect(PRIVACY_EFFECTIVE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(PRIVACY_EFFECTIVE_DATE).toISOString().slice(0, 10)).toBe(PRIVACY_EFFECTIVE_DATE);
  });

  it('never claims anonymity or HIPAA approval', () => {
    expect(fullText).not.toMatch(/\b(is|are) (anonymous|anonymized|HIPAA[- ]compliant|HIPAA approved)\b/i);
    expect(fullText).toContain('does not make records anonymous');
    expect(fullText).toContain('not certified for HIPAA');
  });

  // Each claim below is a fact about the code or config. If one of these
  // fails, the app changed and the policy text has to change with it.
  describe('claims match the app', () => {
    const appJson = JSON.parse(read('app.json')).expo;
    const pkg = JSON.parse(read('package.json'));

    it('label length', () => {
      expect(fullText).toContain(`up to ${LABEL_MAX_LENGTH} characters`);
    });

    it('emergency number', () => {
      expect(fullText).toContain(`with ${EMERGENCY_NUMBER} entered`);
    });

    it('Android backup is off and iOS excludes the database folder', () => {
      expect(appJson.android.allowBackup).toBe(false);
      expect(read('src/platform/database.ts')).toMatch(/excludeFromBackup\(dir\)/);
      expect(read('modules/clock-snapshot/ios/ClockSnapshotModule.swift')).toContain('isExcludedFromBackup = true');
    });

    it('requests no microphone, camera, location, contacts, or photos permission', () => {
      const android: string[] = appJson.android.permissions ?? [];
      expect(android.filter((p) => /AUDIO|CAMERA|LOCATION|CONTACTS|MEDIA_IMAGES|MEDIA_VIDEO/.test(p))).toEqual([]);
      const plistKeys = Object.keys(appJson.ios.infoPlist ?? {});
      expect(
        plistKeys.filter((k) => /Microphone|Camera|Location|Contacts|PhotoLibrary/.test(k)),
      ).toEqual([]);
    });

    it('ships no analytics, ads, crash-reporting, or network-sync SDKs', () => {
      const deps = Object.keys({ ...pkg.dependencies });
      const banned = /analytics|firebase|sentry|bugsnag|crashlytics|posthog|amplitude|mixpanel|segment|admob|ads|appsflyer|adjust|datadog|expo-updates|expo-notifications|expo-location|expo-camera|expo-av|expo-audio|expo-contacts|expo-image-picker|expo-media-library/;
      expect(deps.filter((d) => banned.test(d))).toEqual([]);
    });

    it('source makes no network requests', () => {
      const hits = execSync(
        "grep -rlE 'fetch\\(|XMLHttpRequest|WebSocket|EventSource' src || true",
        { cwd: ROOT, encoding: 'utf8' },
      ).trim();
      expect(hits).toBe('');
    });
  });
});
