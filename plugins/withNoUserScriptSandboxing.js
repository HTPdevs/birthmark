// Xcode's "Update to recommended settings" turns on ENABLE_USER_SCRIPT_SANDBOXING.
// With it on, React Native's "Bundle React Native code and images" phase cannot
// write ip.txt into the app bundle and the build fails with "Operation not
// permitted". ios/ is generated, so this plugin turns it off on every prebuild.
const { withXcodeProject } = require('expo/config-plugins');

/** Sets ENABLE_USER_SCRIPT_SANDBOXING = NO on every build configuration. Returns how many changed. */
function disableUserScriptSandboxing(project) {
  const configs = project.pbxXCBuildConfigurationSection();
  let changed = 0;
  for (const key of Object.keys(configs)) {
    const config = configs[key];
    // The section also holds "<id>_comment" string entries.
    if (typeof config !== 'object' || !config.buildSettings) continue;
    if (config.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING !== 'NO') changed++;
    config.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
  }
  return changed;
}

const withNoUserScriptSandboxing = (config) =>
  withXcodeProject(config, (cfg) => {
    disableUserScriptSandboxing(cfg.modResults);
    return cfg;
  });

module.exports = withNoUserScriptSandboxing;
module.exports.disableUserScriptSandboxing = disableUserScriptSandboxing;
