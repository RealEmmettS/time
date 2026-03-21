# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-03-21

### Added
- Verified `ANALOGY` constants block with 30+ scientifically fact-checked values (eye blink, nerve velocity, finger snap, heartbeat, etc.)
- `humanFraction()` algorithm for natural-language fraction conversion (140ms → "an eighth of a second") using denominator whitelist
- Analogy tags (`analogies[]`) and domain categories (`domain`) on all 212 tier descriptions
- Alternate descriptions (`alt`) on all 100 offset tiers for conflict-free composition
- Two-tier conflict resolution in `_buildTooltip()`: hard conflicts (same analogy) force swap, soft conflicts (same domain) prefer swap
- Live corrected time in browser tab title (updates every second, respects 12/24h toggle)

### Fixed
- Eye blink at 70ms (offset tier) — was wrong, minimum is 100ms; replaced with keypress analogy
- Nerve signal speed — was 0.3ms/cm, corrected to 0.018ms/cm (15x error)
- Finger snap duration — was 80ms, corrected to 7ms (Georgia Tech 2021 study, 11x error)
- Finger-to-brain conduction — was 40ms, corrected to 20ms
- Key press/release duration — was 130ms, corrected to 78ms (Aalto University study)
- Audio monitoring threshold — was 50ms, corrected to 15ms
- Lip-sync detection threshold — was 100ms, corrected to 45ms (ITU standard)
- Fastest conscious reactions — was 100ms, corrected to 120ms
- "About a quarter second" used for ~140ms values — now uses dynamic `humanFraction()` for accurate fractions
- Contradictory analogies across tooltip sections (e.g., eye blink = 70ms in offset vs 150ms in RTT) — now impossible via conflict resolution

## [0.2.1] - 2026-03-21

### Changed
- Clarified all 212 sync tooltip tier descriptions to distinguish device clock from on-screen corrected time
  - RTT tiers (100): "Your clock is accurate to ±Xms" → "The corrected time on screen is accurate to within ±Xms" (with natural variation)
  - Offset tiers (100): "The displayed time is corrected" → "The time shown on screen has been corrected for this"; added "built-in" qualifier to ambiguous "Your clock" references
  - Watch tiers (12): "Total uncertainty: Xms" → "The corrected time on screen is accurate to within Xms"
- Source section in tooltip updated to use "time shown on screen" for consistency

## [0.2.0] - 2026-03-21

### Added
- Binary search tier classification engine (`src/tier-data.js`)
  - 100 RTT tiers, 100 offset tiers, 12 watch-setting guidance tiers (212 total)
  - Logarithmic threshold distribution for precision where it matters most
  - O(log n) classification via right-bisect (7 comparisons max vs 100 linear)
- Combined accuracy score for watch guidance: `(RTT / 2) + absolute offset`

### Changed
- Sync card redesigned: vertically stacked with source, RTT, and offset on separate lines
- Sync card uses fixed width (185px) for consistent UI regardless of content
- Sync detail data moved inside the pill (was floating below it)
- Tooltip rewritten with structured HTML formatting (bold section headings, clean paragraphs)
- All 212 tier descriptions rewritten: layman-friendly, no em dashes, unique per tier
- Tooltip container switched from plain text (`<p>` + `whitespace-pre-line`) to structured HTML (`<div>`)

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
