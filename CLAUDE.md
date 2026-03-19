# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: ATOMIC TIME

A responsive atomic clock web app (time.gov alternative). Vanilla HTML/CSS/JS with Vite — no framework.

## Development

- `npm run dev` — start Vite dev server
- `npm run build` — production build to `dist/`
- `npm run preview` — preview production build

## Pre-Commit Requirements

1. **Update CHANGELOG.md** — add entries under the appropriate version heading
2. **Bump version** in `package.json` to match the changelog
3. **Run `npm run build`** — verify the production build succeeds
4. Commit messages: concise, descriptive, prefixed with `fix:` or `feat:`

## Deployment

Vercel auto-deploys on push to `main` via pre-configured GitHub Actions. No manual Vercel commands needed — just commit and push.

## Conventions

- **Tailwind CSS v4** — uses inline `@theme` block in `src/style.css` (no `tailwind.config.js`)
- **Fonts:** Space Grotesk (headlines/labels), Inter (body) via Google Fonts
- **Design:** Brutalist — zero border radius, hard offset shadows, dot grid bg, all-caps labels
- **Colors:** surface `#f6f6f6`, text `#2d2f2f`, accent `#00fc40`
- **Responsive:** `clamp()` typography scales from mobile (<430px stacked layout) to TV (≥1440px)
- **SHAUGHV branding:** SVG logo in footer + custom favicon in `public/favicon.svg`

## Architecture

### Data Flow

`main.js` creates `AtomicClockSync` and `ClockDisplay`, mounts the display, then starts auto-sync. The sync module fetches atomic time, calculates an offset, and the display module polls `sync.nowMs()` every 20ms to render corrected time.

### Modules

- **`src/atomic-sync.js`** — `AtomicClockSync` (extends EventTarget). Multi-sample minimum-RTT sync algorithm (same as time.gov/NTP). Takes 5 samples from iTime.live (PTB atomic clocks, Germany), falls back to timeapi.io. Calculates `offset = serverTime - clientMidpoint` using the lowest-RTT sample. All fetches use `cache: 'no-store'` + cache-busting query params to prevent CDN from serving stale timestamps. Re-syncs every 10 minutes and on tab re-focus after 2+ minutes hidden.

- **`src/clock-display.js`** — `ClockDisplay`. Renders time via 20ms `setInterval` (not requestAnimationFrame — matches time.gov). Only updates DOM when the second changes. Manages sync status indicator (SYNCED/SYNCING/OFFLINE), 12/24-hour toggle (persisted to localStorage), and a multi-tier tooltip with RTT/offset explanations and watch-setting guidance.

- **`src/timezone.js`** — Timezone detection chain: `Intl.DateTimeFormat` primary (instant, no permissions), geolocation + timeapi.io fallback only on low confidence. Exports formatting helpers for time, date, timezone abbreviation, and UTC offset.

- **`src/main.js`** — Entry point. Instantiates sync + display, starts auto-sync, sets up visibility-change re-sync and timezone confidence check.

- **`src/style.css`** — Tailwind v4 imports + `@theme` block defining the design tokens + custom utilities (`.dot-grid`, `.brutalist-shadow`, `.clock-digits` with `tabular-nums`, `.sync-pulse` animation). Responsive breakpoints at 430px/768px/1440px.
