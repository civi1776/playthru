Pod::Spec.new do |s|
  s.name           = 'ClockedActivity'
  s.version        = '1.0.0'
  s.summary        = 'Expo module for Live Activity shot clock'
  s.homepage       = 'https://clocked.golf'
  s.license        = 'MIT'
  s.author         = 'Clocked Golf'
  s.source         = { git: '' }
  s.static_framework = true

  s.platforms = { ios: '15.1' }
  s.swift_version = '5.0'
  s.source_files = '**/*.swift'

  s.dependency 'ExpoModulesCore'
end
