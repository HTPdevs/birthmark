import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Apple rejects or emails about builds whose PrivacyInfo.xcprivacy is missing a
// "required reason" API. Expo docs: Apple does not reliably read the manifests
// inside static CocoaPods (Expo modules, React Native), so the app-level one in
// app.json ios.privacyManifests has to repeat every reason those pods declare.
// This test re-reads the dependency manifests, so a dependency upgrade that adds
// a reason fails here instead of at App Store review.

const ROOT = join(__dirname, '..');
const NODE_MODULES = join(ROOT, 'node_modules');

type ApiType = { NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] };
const manifest = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo.ios.privacyManifests;

/** Reads (category, reason) pairs from a PrivacyInfo.xcprivacy XML plist. */
function declaredPairs(xml: string): string[] {
  const pairs: string[] = [];
  const entry = /<key>NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>([\s\S]*?)<\/array>/g;
  for (const m of xml.matchAll(entry)) {
    for (const r of m[2].matchAll(/<string>([^<]+)<\/string>/g)) pairs.push(`${m[1]} ${r[1]}`);
  }
  return pairs;
}

/** PrivacyInfo.xcprivacy files shipped by the app's direct dependencies' iOS code. */
function dependencyManifests(): string[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'example' || name === 'android') continue;
      const p = join(dir, name);
      if (name === 'PrivacyInfo.xcprivacy') found.push(p);
      else if (statSync(p).isDirectory()) walk(p, depth + 1);
    }
  };
  for (const dep of Object.keys(pkg.dependencies)) walk(join(NODE_MODULES, dep), 0);
  return found;
}

const appPairs = new Set(
  (manifest.NSPrivacyAccessedAPITypes as ApiType[]).flatMap((t) =>
    t.NSPrivacyAccessedAPITypeReasons.map((r) => `${t.NSPrivacyAccessedAPIType} ${r}`),
  ),
);

describe('iOS privacy manifest', () => {
  const files = dependencyManifests();

  it('finds the dependency manifests (React Native and Expo modules ship them)', () => {
    expect(files.some((f) => f.includes(`${join('react-native', 'React')}`))).toBe(true);
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it.each(files.map((f) => [f.slice(NODE_MODULES.length + 1), f]))(
    'covers every reason declared in %s',
    (_, file) => {
      const missing = declaredPairs(readFileSync(file, 'utf8')).filter((p) => !appPairs.has(p));
      expect(missing).toEqual([]);
    },
  );

  // ClockSnapshot reads kern.boottime and mach_continuous_time to measure
  // elapsed time between captures: reason 35F9.1.
  it('declares system boot time for the ClockSnapshot module', () => {
    const swift = readFileSync(join(ROOT, 'modules/clock-snapshot/ios/ClockSnapshotModule.swift'), 'utf8');
    expect(swift).toMatch(/kern\.boottime|KERN_BOOTTIME|mach_continuous_time/);
    expect(appPairs.has('NSPrivacyAccessedAPICategorySystemBootTime 35F9.1')).toBe(true);
  });

  it('declares no tracking and no collected data, matching the privacy policy', () => {
    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyCollectedDataTypes).toEqual([]);
  });

  it('parses a plist entry', () => {
    const xml = `<dict><key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryDiskSpace</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>E174.1</string><string>85F4.1</string></array></dict>`;
    expect(declaredPairs(xml)).toEqual([
      'NSPrivacyAccessedAPICategoryDiskSpace E174.1',
      'NSPrivacyAccessedAPICategoryDiskSpace 85F4.1',
    ]);
  });
});
