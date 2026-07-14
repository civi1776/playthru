// Custom config plugin to add the ClockWidget Live Activity extension target.
// This replaces @bacons/apple-targets which is incompatible with SDK 55.
const { withXcodeProject, withInfoPlist, withEntitlementsPlist } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const WIDGET_NAME = 'ClockWidget';
const WIDGET_BUNDLE_ID_SUFFIX = '.clock-widget';

function withClockWidget(config) {
  // 1. Add NSSupportsLiveActivities to main app Info.plist
  config = withInfoPlist(config, (config) => {
    config.modResults.NSSupportsLiveActivities = true;
    return config;
  });

  // 2. Add the widget extension to the Xcode project
  config = withXcodeProject(config, async (config) => {
    const project = config.modResults;
    const mainBundleId = config.ios?.bundleIdentifier ?? 'com.civiswings.playthru';
    const widgetBundleId = mainBundleId + WIDGET_BUNDLE_ID_SUFFIX;

    // Copy Swift source files into the ios project
    const projectRoot = config.modRequest.projectRoot;
    const iosDir = path.join(projectRoot, 'ios');
    const widgetDir = path.join(iosDir, WIDGET_NAME);

    if (!fs.existsSync(widgetDir)) {
      fs.mkdirSync(widgetDir, { recursive: true });
    }

    // Copy widget source files
    const sourceDir = path.join(projectRoot, 'targets', 'clock-widget');
    const filesToCopy = ['Attributes.swift', 'ClockWidgetLiveActivity.swift', 'index.swift'];
    for (const file of filesToCopy) {
      const src = path.join(sourceDir, file);
      const dest = path.join(widgetDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }

    // Copy Info.plist for the widget
    const infoPlistSrc = path.join(sourceDir, 'Info.plist');
    const infoPlistDest = path.join(widgetDir, 'Info.plist');
    if (fs.existsSync(infoPlistSrc)) {
      fs.copyFileSync(infoPlistSrc, infoPlistDest);
    }

    // Add widget target to Xcode project
    const targetUuid = project.generateUuid();
    const widgetTarget = project.addTarget(
      WIDGET_NAME,
      'app_extension',
      WIDGET_NAME,
      widgetBundleId
    );

    if (widgetTarget) {
      // Add Swift files to the target
      const groupKey = project.pbxCreateGroup(WIDGET_NAME, WIDGET_NAME);
      const mainGroupKey = project.getFirstProject().firstProject.mainGroup;
      project.addToPbxGroup(groupKey, mainGroupKey);

      for (const file of [...filesToCopy, 'Info.plist']) {
        const filePath = path.join(WIDGET_NAME, file);
        if (file.endsWith('.swift')) {
          project.addSourceFile(filePath, { target: widgetTarget.uuid }, groupKey);
        } else {
          project.addFile(filePath, groupKey);
        }
      }

      // Set build settings for the widget target
      const configs = project.pbxXCBuildConfigurationSection();
      for (const key in configs) {
        const config = configs[key];
        if (config.buildSettings && config.name &&
            JSON.stringify(config).includes(WIDGET_NAME)) {
          config.buildSettings.INFOPLIST_FILE = `${WIDGET_NAME}/Info.plist`;
          config.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${widgetBundleId}"`;
          config.buildSettings.SWIFT_VERSION = '5.0';
          config.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
          config.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.2';
          config.buildSettings.CODE_SIGN_STYLE = 'Automatic';
          config.buildSettings.GENERATE_INFOPLIST_FILE = 'YES';
        }
      }
    }

    return config;
  });

  return config;
}

module.exports = withClockWidget;
