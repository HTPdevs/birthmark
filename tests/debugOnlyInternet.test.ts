import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Release builds block INTERNET (app.json android.blockedPermissions), so the
// offline claim in the privacy policy holds for what ships. Debug builds load
// the bundle from Metro and need it back; this plugin adds it to the debug
// manifests, which outrank main in the Gradle merge. Verified on prebuild:
// release merged manifest has no INTERNET, debug and debugOptimized have it.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addDebugInternetPermission, patchDevManifests } = require('../plugins/withDebugOnlyInternet');

const appJson = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8')).expo;

// The Expo SDK 57 template's android/app/src/debug/AndroidManifest.xml.
const TEMPLATE = `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>

    <application android:usesCleartextTraffic="true" tools:targetApi="28" tools:ignore="GoogleAppIndexingWarning" tools:replace="android:usesCleartextTraffic" />
</manifest>
`;

const count = (xml: string) => (xml.match(/android\.permission\.INTERNET/g) ?? []).length;

describe('debug-only INTERNET plugin', () => {
  it('adds INTERNET before <application>', () => {
    const out = addDebugInternetPermission(TEMPLATE);
    expect(count(out)).toBe(1);
    expect(out.indexOf('android.permission.INTERNET')).toBeLessThan(out.indexOf('<application'));
    expect(out).toContain('android.permission.SYSTEM_ALERT_WINDOW');
  });

  it('is idempotent', () => {
    const once = addDebugInternetPermission(TEMPLATE);
    expect(addDebugInternetPermission(once)).toBe(once);
  });

  it('fails loudly if the template has no <application>', () => {
    expect(() => addDebugInternetPermission('<manifest></manifest>')).toThrow(/no <application>/);
  });

  describe('on a prebuilt android/ tree', () => {
    let root: string;
    const manifest = (variant: string) => join(root, 'app', 'src', variant, 'AndroidManifest.xml');
    const write = (variant: string) => {
      mkdirSync(join(root, 'app', 'src', variant), { recursive: true });
      writeFileSync(manifest(variant), TEMPLATE);
    };

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'birthmark-android-'));
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('patches debug and debugOptimized, and stays single across repeated prebuilds', () => {
      write('debug');
      write('debugOptimized');
      write('main');
      expect(patchDevManifests(root)).toEqual(['debug', 'debugOptimized']);
      patchDevManifests(root);
      expect(count(readFileSync(manifest('debug'), 'utf8'))).toBe(1);
      expect(count(readFileSync(manifest('debugOptimized'), 'utf8'))).toBe(1);
      expect(readFileSync(manifest('main'), 'utf8')).toBe(TEMPLATE);
    });

    it('skips a missing debugOptimized', () => {
      write('debug');
      expect(patchDevManifests(root)).toEqual(['debug']);
    });

    it('fails when the debug manifest is missing', () => {
      expect(() => patchDevManifests(root)).toThrow(/ENOENT/);
    });
  });

  it('is registered in app.json', () => {
    expect(appJson.plugins).toContain('./plugins/withDebugOnlyInternet');
  });
});

describe('release Android permissions', () => {
  it('blocks INTERNET, overlay, and legacy storage', () => {
    // Exact list: blocking a permission a library calls at runtime throws
    // SecurityException, so additions here need the same release check.
    expect(appJson.android.blockedPermissions).toEqual([
      'android.permission.INTERNET',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ]);
  });
});
