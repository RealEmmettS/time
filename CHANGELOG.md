# Changelog

All notable changes to this project will be documented in this file.

## [0.1.2] - 2026-03-19

### Fixed
- Fixed ~2 second clock delay caused by CDN/browser caching of time API responses — added `cache: 'no-store'` and cache-busting query parameter to all sync fetches

## [0.1.1] - 2026-03-19

### Fixed
- Fixed offset calculation bug that double-counted RTT/2 (~73ms accuracy improvement)
- Fixed clock rendering: switched from requestAnimationFrame to 20ms setInterval (matches time.gov) for consistent second ticking
- Fixed sync fallback loop logic for cleaner endpoint switching
- Removed dead code (unused timezone exports)

### Changed
- Sync status pill: larger text, darker detail line, shows time source name (PTB Atomic Clock / NTP Server)
- SHAUGHV logo: much larger (h-10/h-14) and more visible (opacity 70%)
- Sync tooltip: tap to open on mobile, hover on desktop, scrollable on small screens
  - 15 RTT tiers (from <15ms "laboratory-grade" to >5000ms "unusable")
  - 15 offset tiers (from <2ms "virtually perfect" to hours off "device needs attention")
  - 12 combined watch-setting guidance tiers (RTT + offset cross-referenced)
  - Real-world analogies and actionable watch-setting advice at each level
- Stacked clock layout on narrow portrait (<430px): HH:MM on top, SS below for maximum digit size
- Timezone detection: Intl API primary (no permissions), geolocation + timeapi.io fallback only on low confidence
- Added theme-color meta tag and mobile web app meta tags
- Responsive padding and spacing refinements across all breakpoints
- Custom Quiver AI-generated SVG favicon (brutalist angular clock icon)
- Updated HTML meta description with QubeTX/SHAUGHV branding
- README: added SHAUGHV, QubeTX, emmetts.dev links and branding

## [0.1.0] - 2026-03-19

### Added
- Initial release
- Atomic clock sync via iTime.live API (PTB atomic clocks, Germany)
- Multi-sample minimum-RTT sync algorithm (~30-50ms accuracy)
- Fallback to timeapi.io when primary is unreachable
- Auto timezone detection via browser Intl API
- 12-hour (default) and 24-hour display toggle
- Toggle preference persisted to localStorage
- Live sync status indicator (synced/syncing/offline)
- Brutalist design: dot grid background, hard shadows, zero border radius
- Responsive layout for mobile, tablet, desktop, and TV screens
- Re-syncs every 10 minutes and on tab re-focus
- SHAUGHV branding (favicon + footer logo)
