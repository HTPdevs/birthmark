import { readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// With ENABLE_USER_SCRIPT_SANDBOXING = YES (set by Xcode's "Update to recommended
// settings"), the "Bundle React Native code and images" phase fails on device
// builds: "ip.txt: Operation not permitted". The fixture is a real prebuilt
// project.pbxproj with sandboxing on at project and target level (the state of
// the failing build's log), with DEVELOPMENT_TEAM removed.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const xcode = require('xcode');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { disableUserScriptSandboxing } = require('../plugins/withNoUserScriptSandboxing');

const root = join(__dirname, '..');
const fixture = join(__dirname, 'fixtures', 'sandboxed.pbxproj');

function parse(path: string) {
  const project = xcode.project(path);
  project.parseSync();
  return project;
}

function sandboxValues(project: { pbxXCBuildConfigurationSection: () => Record<string, unknown> }) {
  return Object.values(project.pbxXCBuildConfigurationSection())
    .filter((c): c is { buildSettings: Record<string, string> } => typeof c === 'object' && c !== null)
    .map((c) => c.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING ?? 'unset');
}

describe('user script sandboxing plugin', () => {
  it('starts from a project with sandboxing on everywhere', () => {
    expect(sandboxValues(parse(fixture))).toEqual(['YES', 'YES', 'YES', 'YES']);
  });

  it('turns sandboxing off on every build configuration, and survives a write', () => {
    const project = parse(fixture);
    expect(disableUserScriptSandboxing(project)).toBe(4);
    const out = join(tmpdir(), `birthmark-${process.pid}.pbxproj`);
    writeFileSync(out, project.writeSync());
    const values = sandboxValues(parse(out));
    expect(values).toHaveLength(4);
    expect(values.every((v) => v === 'NO')).toBe(true);
  });

  it('is idempotent', () => {
    const project = parse(fixture);
    disableUserScriptSandboxing(project);
    expect(disableUserScriptSandboxing(project)).toBe(0);
  });

  it('is registered in app.json', () => {
    const plugins: unknown[] = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo.plugins;
    expect(plugins).toContain('./plugins/withNoUserScriptSandboxing');
  });
});
