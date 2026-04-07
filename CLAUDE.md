# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: ATOMIC TIME

A responsive atomic clock web app (time.gov alternative). Vanilla HTML/CSS/JS with Vite — no framework.

## Development

- `npm install` — install dependencies (first time or after pulling)
- `npm run dev` — start Vite dev server (opens browser automatically)
- `npm run build` — production build to `dist/`
- `npm run preview` — preview production build
- No test framework — there are no automated tests in this project

## Formatting & CI

Prettier enforces formatting. CI (`.github/workflows/ci.yml`, Node 22) runs on every push to `main` and PR:

1. `npx prettier --check "src/**/*.{js,css}" "api/**/*.js" index.html` — formatting check
2. `npm run build` — production build verification

Fix formatting locally before committing: `npx prettier --write "src/**/*.{js,css}" "api/**/*.js" index.html`

## Pre-Commit Requirements

1. **Update CHANGELOG.md** — add entries under the appropriate version heading
2. **Bump version** in `package.json` to match the changelog
3. **Run `npm run build`** — verify the production build succeeds
4. **Run Prettier** — ensure formatting passes (CI will reject unformatted code)
5. Commit messages: concise, descriptive, prefixed with `fix:` or `feat:`

## Deployment

Vercel auto-deploys on push to `main` via GitHub integration. No manual Vercel commands needed — just commit and push.

## Conventions

- **Copyright header:** Every source file must include a copyright line at the top. Use `// Copyright QubeTX — tikset.com` for JS files, `/* Copyright QubeTX — tikset.com */` for CSS, and `<!-- Copyright QubeTX — tikset.com -->` for HTML.
- **Tailwind CSS v4** — uses inline `@theme` block in `src/style.css` (no `tailwind.config.js`)
- **Fonts:** Makira Sans Serif (headlines/body, self-hosted WOFF2 from `public/fonts/`), Space Grotesk (clock digits only, Google Fonts). See `@theme` block in `src/style.css` for `--font-headline`, `--font-body`, `--font-clock`.
- **Design:** Brutalist — zero border radius, hard offset shadows, dot grid bg, all-caps labels
- **Colors:** surface `#f6f6f6`, text `#2d2f2f`, accent `#00fc40`
- **Responsive:** `clamp()` typography scales from mobile (<430px stacked layout) to TV (≥1440px)
- **SHAUGHV branding:** SVG logo in footer + custom favicon in `public/favicon.svg`

## Architecture

### Data Flow

`main.js` creates `AtomicClockSync` and `ClockDisplay`, mounts the display, then starts auto-sync. The sync module fetches atomic time, calculates an offset, and the display module polls `sync.nowMs()` every 20ms to render corrected time.

### Modules

- **`api/time.js`** — Vercel Edge Function. Self-hosted time endpoint returning `Date.now()` as JSON. Runs on Vercel's global edge network (<1ms cold start). NTP-synced to ~1-2ms of UTC via Stratum 2-3 infrastructure.

- **`src/atomic-sync.js`** — `AtomicClockSync` (extends EventTarget). Marzullo-fused multi-sample sync algorithm. 3-tier endpoint chain: self-hosted Vercel Edge (`/api/time`) → time.now API → timeapi.io. Takes 8 samples per endpoint with 50ms delays, applies IQR outlier filtering, then Marzullo's interval fusion algorithm to find the tightest confidence interval. Connection pre-warming (throwaway fetch) before sampling. All fetches use `cache: 'no-store'` + cache-busting query params. Re-syncs every 10 minutes and on tab re-focus after 2+ minutes hidden.

- **`src/tier-data.js`** — Tier classification engine. 100 RTT tiers + 100 offset tiers + 12 watch guidance tiers = 212 total. `bisectRight()` + `classify()` for O(log n) lookups over logarithmically distributed thresholds. Exports `ANALOGY` constants (30+ peer-reviewed values) that all tier descriptions must reference — never hardcode analogy numbers. Each tier has `analogies[]` tags and `domain` category; offset tiers carry `alt` descriptions. `_buildTooltip()` in clock-display.js runs two-tier conflict resolution (hard: same analogy, soft: same domain) before rendering.

- **`src/clock-display.js`** — `ClockDisplay`. Renders time via 20ms `setInterval` (not requestAnimationFrame — matches time.gov). Only updates DOM when the second changes. Manages sync status indicator (SYNCED/SYNCING/OFFLINE), 12/24-hour toggle (persisted to localStorage), and a multi-tier tooltip with RTT/offset explanations and watch-setting guidance. Uses `@chenglou/pretext` for dynamic fit-to-width clock digit sizing and sync pill width measurement.

- **`src/timezone.js`** — Timezone detection chain: `Intl.DateTimeFormat` primary (instant, no permissions), geolocation + timeapi.io fallback only on low confidence. Exports formatting helpers for time, date, timezone abbreviation, and UTC offset.

- **`src/main.js`** — Entry point. Instantiates sync + display, starts auto-sync, sets up visibility-change re-sync and timezone confidence check.

- **`src/style.css`** — Tailwind v4 imports + `@font-face` declarations for Makira + `@theme` block defining design tokens + custom utilities (`.dot-grid`, `.brutalist-shadow`, `.clock-digits` with `tabular-nums`, `.sync-pulse` animation). Responsive breakpoints at 430px/768px/1440px.

### Key Gotchas

- **DOM coupling:** `ClockDisplay.mount()` binds to specific element IDs in `index.html`: `clock-hours`, `clock-minutes`, `clock-seconds`, `clock-ampm`, `clock-timezone`, `clock-date`, `sync-dot`, `sync-text`, `sync-detail`, `sync-tooltip-text`, `sync-btn`, `sync-tooltip`, `toggle-24`. Renaming any of these requires updating both files.
- **Pretext + Vite:** `@chenglou/pretext` ships raw TypeScript, so `vite.config.js` has `optimizeDeps.include: ["@chenglou/pretext"]` to force pre-bundling. Removing this will break dev server.
- **Analogy accuracy:** All tier descriptions in `tier-data.js` must use the exported `ANALOGY` constants, never raw numbers. Previous versions had factual errors (e.g., eye blink at 70ms instead of 150ms) that were systematically corrected.
