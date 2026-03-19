# Changelog

All notable changes to this project will be documented in this file.

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
