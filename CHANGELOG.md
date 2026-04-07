# Changelog

All notable changes to this project will be documented in this file.

## [0.5.0] - 2026-04-07

### Added

- **Self-hosted Vercel Edge Function time API** (`/api/time`) — runs on Vercel's global edge network with <1ms cold start and ~5-20ms RTT. NTP-synced to within 1-2ms of UTC via Stratum 2-3 infrastructure. Eliminates all third-party API dependency for primary sync.
- **Marzullo's algorithm for interval fusion** — the same algorithm family used by NTP. Builds confidence intervals (`[offset - RTT/2, offset + RTT/2]`) from all samples, then finds the maximum-overlap intersection via sweep-line. Returns the midpoint (tighter offset estimate) and radius (tighter uncertainty bound). Yields 2-5x tighter bounds than naive minimum-RTT selection.
- **IQR-based outlier filtering** — removes statistical outliers before Marzullo fusion using interquartile range (Q3 + 1.5*IQR upper fence). Preserves at least 2 samples even under aggressive filtering.
- **Connection pre-warming** — throwaway fetch before sample collection establishes DNS + TCP + TLS so all measurement samples run on a warm connection. Drops first-sample RTT from ~467ms (cold) to ~63-146ms (warm) on third-party endpoints.
- **3-tier endpoint fallback chain** with automatic failover:
  1. Self-hosted Vercel Edge (same-origin, ~5-20ms RTT)
  2. [time.now](https://time.now/developer) Atomic Time API (BunnyCDN, ~63ms RTT, microsecond precision)
  3. [timeapi.io](https://timeapi.io) NTP server (~146ms RTT, proven reliable)
- **Active endpoint source indicator** in sync tooltip — shows which API is currently being used (e.g., "Vercel Edge (NTP-synced)") and whether it's the primary or a fallback
- **Speed test link** — [speedqx.com](https://speedqx.com) link in the Round-Trip Time tooltip section so users can test their connection speed
- **Marzullo uncertainty display** — tooltip shows the interval-fusion-tightened uncertainty (e.g., "narrowed the uncertainty to +/-12ms")
- **GitHub Actions CI workflow** (`.github/workflows/ci.yml`) — runs on pushes to `main` and PRs: Prettier formatting check, production build verification. Ensures code quality before Vercel auto-deploys.
- **Prettier** added as dev dependency for consistent code formatting

### Changed

- **Sync algorithm upgraded from minimum-RTT to Marzullo fusion** — fuses information from ALL good samples instead of discarding everything except the single best one
- **Default sample count increased from 5 to 8** — more samples for better statistical coverage
- **Inter-sample delay reduced from 200ms to 50ms** — total sync time drops from ~2.5s to ~0.5s
- **Abort timeout reduced from 5s to 3s** — samples with 3s+ RTT are useless for accuracy
- **Confidence thresholds updated** — adjusted for the lower RTTs achievable with edge functions (<50ms = high, <150ms = medium, <300ms = fair)

### Removed

- **itime.live endpoint** — verified via curl that it lacks CORS headers (`Access-Control-Allow-Origin`), meaning it was silently failing from browsers on every sync attempt and falling back to timeapi.io after wasting 500-900ms. Confirmed by Perplexity deep research.
- **PTB Atomic Clock source label** — replaced with accurate endpoint-specific labels

### Fixed

- Eliminated ~500-900ms of wasted time per sync cycle caused by the CORS-failing itime.live primary endpoint
- **Watch score formula corrected** — now uses only Marzullo sync uncertainty instead of `(RTT/2) + absOffset`. The device clock offset is a correction being applied, not an error in the displayed time. A 1700ms offset with 36ms uncertainty now correctly shows "accurate to within 36ms" instead of the misleading "1737ms".
- **Tooltip hover delay** — 1.5s delay before tooltip hides on mouse exit, and hovering the tooltip itself cancels the timer so users can scroll long tooltip content
- **Source descriptions improved** — Vercel Edge describes Stratum 2-3 NTP sync; time.now clarifies microsecond resolution vs actual NTP-level accuracy

## [0.4.0] - 2026-04-06

### Added

- **Pretext integration** (`@chenglou/pretext`) for dynamic text measurement and responsive clock sizing
- **Dynamic fit-to-width clock digits** — Pretext measures clock text at runtime and scales font size to fill available viewport width, with responsive padding (more on large screens, less on mobile). CSS `clamp()` retained as fallback before fonts load.
- **Watch side-view SVG watermark** — faint (2.5% opacity) full-viewport-height wristwatch silhouette behind the clock digits
- **Watch-band SVG in sync pill** — decorative watch-band illustration positioned on the right edge of the sync status pill, clipped by parent overflow for a partial-silhouette effect
- **Pretext-powered sync pill sizing** — button width dynamically measured via Pretext after each status change so text never overlaps the watch SVG decoration
- RAF-gated window resize listener for smooth Pretext re-measurement (no ResizeObserver)
- Font readiness gate (`document.fonts.ready`) before all Pretext measurements
- Vite `optimizeDeps.include` configuration for Pretext's raw TypeScript source

### Changed

- Sync pill restructured: `relative overflow-hidden` container with absolutely positioned clipped SVG decoration
- Sync pill width is now dynamic (Pretext-measured) instead of fixed `w-[185px]`
- Copyright headers (`Copyright QubeTX — tikset.com`) added to all source files
- README updated with tikset.com as primary host
- CLAUDE.md updated with copyright header convention for all new files

## [0.3.2] - 2026-04-06

### Changed

- Precision label updated from "ATOMIC CLOCK PRECISION TIME" to "NIST ATOMIC CLOCK PRECISION"

## [0.3.1] - 2026-04-06

### Changed

- Replaced favicon with detailed wristwatch SVG icon (green watch face with hour numbers and hands)

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
