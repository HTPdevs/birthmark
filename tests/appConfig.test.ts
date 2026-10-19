import { readFileSync } from 'fs';
import { join } from 'path';

const appJson = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8')).expo;
const easJson = JSON.parse(readFileSync(join(__dirname, '..', 'eas.json'), 'utf8'));

// Store listings are keyed to these ids and they can never change after the
// first upload, so a rename here would publish a different app.
describe('app config', () => {
  it('Android application id is com.htpdevs.birthmark', () => {
    expect(appJson.android.package).toBe('com.htpdevs.birthmark');
  });

  it('iOS bundle identifier is com.htpdevs.birthmark', () => {
    expect(appJson.ios.bundleIdentifier).toBe('com.htpdevs.birthmark');
  });

  // `eas submit` uploads to this App Store Connect record. A wrong id would
  // upload to a different app or fail after a full cloud build.
  it('EAS iOS submit profile targets the Birthmark App Store Connect record', () => {
    expect(easJson.submit.production.ios).toEqual({
      ascAppId: '6824593882',
      appleTeamId: 'ZTF9443M3J',
    });
  });
});
