// Custom config plugin to add the ClockWidget Live Activity extension target.
// This replaces @bacons/apple-targets which is incompatible with SDK 55.
const { withXcodeProject, withInfoPlist, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const WIDGET_NAME = 'ClockWidget';
const WIDGET_BUNDLE_ID_SUFFIX = '.clock-widget';
const APPLE_TEAM_ID = 'CL344GMS7J';

function withClockWidget(config) {
  // 1. Add NSSupportsLiveActivities to main app Info.plist
  config = withInfoPlist(config, (config) => {
    config.modResults.NSSupportsLiveActivities = true;
    return config;
  });

  // 2. Copy widget Swift sources into ios/ during prebuild + patch Podfile
  config = withDangerousMod(config, ['ios', async (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const iosDir = config.modRequest.platformProjectRoot;
    const widgetDir = path.join(iosDir, WIDGET_NAME);

    if (!fs.existsSync(widgetDir)) {
      fs.mkdirSync(widgetDir, { recursive: true });
    }

    const sourceDir = path.join(projectRoot, 'targets', 'clock-widget');
    const allFiles = ['Attributes.swift', 'ClockWidgetLiveActivity.swift', 'index.swift', 'Info.plist'];
    for (const file of allFiles) {
      const src = path.join(sourceDir, file);
      const dest = path.join(widgetDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }

    // Patch Podfile: disable code signing for resource bundle targets (Xcode 15+)
    const podfilePath = path.join(iosDir, 'Podfile');
    if (fs.existsSync(podfilePath)) {
      let podfile = fs.readFileSync(podfilePath, 'utf8');
      const resourceBundleFix = `\n    # Disable code signing for resource bundle targets (Xcode 15+)\n    installer.pods_project.targets.each do |target|\n      if target.respond_to?(:product_type) && target.product_type == "com.apple.product-type.bundle"\n        target.build_configurations.each do |config|\n          config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'\n        end\n      end\n    end`;

      if (podfile.includes('post_install do |installer|')) {
        podfile = podfile.replace(
          /post_install do \|installer\|/,
          `post_install do |installer|${resourceBundleFix}`
        );
      } else {
        podfile += `\npost_install do |installer|${resourceBundleFix}\nend\n`;
      }
      fs.writeFileSync(podfilePath, podfile);
    }

    return config;
  }]);

  // 3. Add the widget extension target to the Xcode project
  config = withXcodeProject(config, async (config) => {
    const project = config.modResults;
    const mainBundleId = config.ios?.bundleIdentifier ?? 'com.civiswings.playthru';
    const widgetBundleId = mainBundleId + WIDGET_BUNDLE_ID_SUFFIX;
    const objects = project.hash.project.objects;

    // Create the widget native target (creates target with empty buildPhases)
    const widgetTarget = project.addTarget(
      WIDGET_NAME,
      'app_extension',
      WIDGET_NAME,
      widgetBundleId
    );

    if (!widgetTarget) return config;

    // Create a Sources build phase for the widget and wire it up
    const sourcesPhaseUuid = project.generateUuid();
    if (!objects.PBXSourcesBuildPhase) objects.PBXSourcesBuildPhase = {};
    objects.PBXSourcesBuildPhase[sourcesPhaseUuid] = {
      isa: 'PBXSourcesBuildPhase',
      buildActionMask: 2147483647,
      files: [],
      runOnlyForDeploymentPostprocessing: 0,
    };
    objects.PBXSourcesBuildPhase[sourcesPhaseUuid + '_comment'] = 'Sources';

    // Add the Sources phase to the widget native target's buildPhases
    const ntObj = objects.PBXNativeTarget[widgetTarget.uuid];
    if (ntObj) {
      ntObj.buildPhases.push({ value: sourcesPhaseUuid, comment: 'Sources' });
    }

    // Create the ClockWidget group
    const groupKey = project.pbxCreateGroup(WIDGET_NAME, WIDGET_NAME);
    const mainGroupKey = project.getFirstProject().firstProject.mainGroup;
    project.addToPbxGroup(groupKey, mainGroupKey);

    // Add Swift files — file references in the group, build files in widget Sources only
    const swiftFiles = ['Attributes.swift', 'ClockWidgetLiveActivity.swift', 'index.swift'];

    for (const fileName of swiftFiles) {
      // PBXFileReference (path relative to group, which has path = ClockWidget)
      const fileRefUuid = project.generateUuid();
      objects.PBXFileReference[fileRefUuid] = {
        isa: 'PBXFileReference',
        fileEncoding: 4,
        lastKnownFileType: 'sourcecode.swift',
        name: fileName,
        path: fileName,
        sourceTree: '"<group>"',
      };
      objects.PBXFileReference[fileRefUuid + '_comment'] = fileName;

      // Add to ClockWidget group
      const grp = objects.PBXGroup[groupKey];
      if (grp) {
        grp.children.push({ value: fileRefUuid, comment: fileName });
      }

      // PBXBuildFile → widget Sources phase only
      const buildFileUuid = project.generateUuid();
      objects.PBXBuildFile[buildFileUuid] = {
        isa: 'PBXBuildFile',
        fileRef: fileRefUuid,
        fileRef_comment: fileName,
      };
      objects.PBXBuildFile[buildFileUuid + '_comment'] = `${fileName} in Sources`;

      // Add to widget Sources phase
      objects.PBXSourcesBuildPhase[sourcesPhaseUuid].files.push({
        value: buildFileUuid,
        comment: `${fileName} in Sources`,
      });
    }

    // Add Info.plist file reference (not in any build phase)
    const plistRefUuid = project.generateUuid();
    objects.PBXFileReference[plistRefUuid] = {
      isa: 'PBXFileReference',
      fileEncoding: 4,
      lastKnownFileType: 'text.plist.xml',
      name: 'Info.plist',
      path: 'Info.plist',
      sourceTree: '"<group>"',
    };
    objects.PBXFileReference[plistRefUuid + '_comment'] = 'Info.plist';
    const grp = objects.PBXGroup[groupKey];
    if (grp) {
      grp.children.push({ value: plistRefUuid, comment: 'Info.plist' });
    }

    // Set build settings for the widget target (Debug + Release)
    const configs = project.pbxXCBuildConfigurationSection();
    for (const key in configs) {
      const cfg = configs[key];
      if (cfg.buildSettings && cfg.name &&
          JSON.stringify(cfg).includes(WIDGET_NAME)) {
        cfg.buildSettings.INFOPLIST_FILE = `${WIDGET_NAME}/Info.plist`;
        cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${widgetBundleId}"`;
        cfg.buildSettings.SWIFT_VERSION = '5.0';
        cfg.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
        cfg.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.2';
        cfg.buildSettings.CODE_SIGN_STYLE = 'Automatic';
        cfg.buildSettings.DEVELOPMENT_TEAM = APPLE_TEAM_ID;
        cfg.buildSettings.GENERATE_INFOPLIST_FILE = 'YES';
      }
    }

    return config;
  });

  return config;
}

module.exports = withClockWidget;
