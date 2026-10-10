// Release builds must not hold INTERNET: the app is offline and the privacy
// policy says nothing leaves the device. app.json blocks it through
// android.blockedPermissions, which writes a tools:node="remove" entry into the
// main manifest and strips it from every library manifest too. Debug builds
// still need it to load the JS bundle from Metro, so this plugin declares it in
// the debug manifests (debug, and debugOptimized when the template has it),
// which outrank main in the merge and keep it there.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const INTERNET = '<uses-permission android:name="android.permission.INTERNET"/>';
const DEV_VARIANTS = ['debug', 'debugOptimized'];

/** Returns the debug manifest with INTERNET declared once, before <application>. */
function addDebugInternetPermission(xml) {
  if (/android:name="android\.permission\.INTERNET"/.test(xml)) return xml;
  const at = xml.indexOf('<application');
  if (at < 0) throw new Error('withDebugOnlyInternet: debug manifest has no <application> element');
  return `${xml.slice(0, at)}${INTERNET}\n\n    ${xml.slice(at)}`;
}

/** Patches the dev-variant manifests under an android/ project root. Returns the variants patched. */
function patchDevManifests(androidRoot) {
  const patched = [];
  for (const variant of DEV_VARIANTS) {
    const file = path.join(androidRoot, 'app', 'src', variant, 'AndroidManifest.xml');
    // debug always exists; a missing one means the template changed, so fail loudly.
    if (variant !== 'debug' && !fs.existsSync(file)) continue;
    fs.writeFileSync(file, addDebugInternetPermission(fs.readFileSync(file, 'utf8')));
    patched.push(variant);
  }
  return patched;
}

const withDebugOnlyInternet = (config) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      patchDevManifests(cfg.modRequest.platformProjectRoot);
      return cfg;
    },
  ]);

module.exports = withDebugOnlyInternet;
module.exports.addDebugInternetPermission = addDebugInternetPermission;
module.exports.patchDevManifests = patchDevManifests;
