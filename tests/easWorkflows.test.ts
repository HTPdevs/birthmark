import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// EAS workflow build jobs name an eas.json profile. A typo or a renamed profile
// only fails on EAS, after the PR is open. `eas workflow:validate` catches it
// too but needs a login, so this is the offline gate.
const ROOT = join(__dirname, '..');
const DIR = join(ROOT, '.eas', 'workflows');
const eas = JSON.parse(readFileSync(join(ROOT, 'eas.json'), 'utf8'));

const workflows = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
const profilesIn = (yml: string) => [...yml.matchAll(/^\s+profile:\s*['"]?([\w-]+)/gm)].map((m) => m[1]);

describe('EAS workflows', () => {
  it.each(workflows)('%s: every build profile exists in eas.json', (file) => {
    for (const p of profilesIn(readFileSync(join(DIR, file), 'utf8'))) {
      expect(Object.keys(eas.build)).toContain(p);
    }
  });

  describe('pr-builds.yml', () => {
    const yml = readFileSync(join(DIR, 'pr-builds.yml'), 'utf8');

    it('runs on pull requests to main and builds both platforms with the pr profile', () => {
      expect(yml).toMatch(/^on:\n\s+pull_request:\n\s+branches: \['main'\]/m);
      expect(yml).toMatch(/platform: android\n\s+profile: pr/);
      expect(yml).toMatch(/platform: ios\n\s+profile: pr/);
    });

    // PR builds must not need signing credentials: none are set up for iOS,
    // and a store keystore has no business signing throwaway PR artifacts.
    it('pr profile needs no signing credentials', () => {
      const pr = eas.build.pr;
      expect(pr.android).toEqual({ buildType: 'apk', withoutCredentials: true });
      expect(pr.ios).toEqual({ simulator: true });
      expect(pr.developmentClient).toBeUndefined();
      expect(pr.autoIncrement).toBeUndefined();
    });
  });
});
