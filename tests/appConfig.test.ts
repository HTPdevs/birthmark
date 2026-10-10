import { readFileSync } from 'fs';
import { join } from 'path';

const appJson = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8')).expo;

// The Play Store listing is keyed to this id and it can never change after the
// first upload, so a rename here would publish a different app.
describe('app config', () => {
  it('Android application id is com.htpdevs.birthmark', () => {
    expect(appJson.android.package).toBe('com.htpdevs.birthmark');
  });
});
