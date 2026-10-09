import { readFileSync } from 'fs';
import { join } from 'path';

// Apps built with the iOS 27 SDK are killed at launch unless they adopt the UIScene
// life cycle ("UIScene life cycle is required for apps built with this SDK"). On
// Expo SDK 57 that adoption comes only from expo-build-properties'
// `ios.enableSceneSupport`; removing it brings the launch crash back.
// See https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md

const root = join(__dirname, '..');
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));

type PluginEntry = string | [string, Record<string, unknown>];

describe('iOS scene life cycle', () => {
  const plugins: PluginEntry[] = readJson('app.json').expo.plugins;
  const buildProps = plugins.find(
    (p): p is [string, Record<string, unknown>] => Array.isArray(p) && p[0] === 'expo-build-properties',
  );

  it('enables scene support through expo-build-properties', () => {
    expect(buildProps).toBeDefined();
    expect((buildProps![1].ios as { enableSceneSupport?: boolean })?.enableSceneSupport).toBe(true);
  });

  it('runs on an expo patch that ships ExpoAppSceneDelegate (>= 57.0.23)', () => {
    const [major, minor, patch] = readJson('node_modules/expo/package.json').version.split('.').map(Number);
    // SDK 58+ adopts scenes in the template and the flag becomes a no-op; revisit then.
    expect(major).toBe(57);
    expect(minor > 0 || patch >= 23).toBe(true);
  });
});
