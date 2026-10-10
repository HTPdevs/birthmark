import { readFileSync } from 'fs';
import { join } from 'path';

// Store upload rules checked against the PNG header (IHDR):
// - App Store Connect rejects an app icon with an alpha channel.
// - Google Play's feature graphic must be 1024x500, JPEG or 24-bit PNG, no alpha.
const ROOT = join(__dirname, '..');

const PNG_SIGNATURE = '89504e470d0a1a0a';
// IHDR color types: 0 gray, 2 RGB, 3 palette, 4 gray+alpha, 6 RGB+alpha.
const ALPHA_COLOR_TYPES = [4, 6];

function pngInfo(rel: string) {
  const buf = readFileSync(join(ROOT, rel));
  expect(buf.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25],
    // A palette or gray PNG can still carry transparency in a tRNS chunk.
    hasTrns: buf.includes(Buffer.from('tRNS', 'ascii')),
  };
}

const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo;

describe('store assets', () => {
  it.each([appJson.icon, appJson.ios.icon])('iOS app icon %s is 1024x1024 with no alpha', (rel: string) => {
    const info = pngInfo(rel);
    expect([info.width, info.height]).toEqual([1024, 1024]);
    expect(ALPHA_COLOR_TYPES).not.toContain(info.colorType);
    expect(info.hasTrns).toBe(false);
  });

  it('Play feature graphic is a 1024x500 24-bit PNG with no alpha', () => {
    const info = pngInfo('assets/play-feature-graphic-1024x500.png');
    expect([info.width, info.height]).toEqual([1024, 500]);
    expect(info.colorType).toBe(2);
    expect(info.hasTrns).toBe(false);
  });

  it('Play listing icon is 512x512', () => {
    const info = pngInfo('assets/play-store-512.png');
    expect([info.width, info.height]).toEqual([512, 512]);
  });
});
