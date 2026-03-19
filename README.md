# ATOMIC TIME

A beautiful, responsive atomic clock web app — an alternative to [time.gov](https://time.gov).

Syncs with PTB (Germany) atomic clocks via [iTime.live](https://itime.live) with NTP-style round-trip delay compensation. Auto-detects your timezone and displays a large, readable clock on any device.

## Features

- Atomic clock sync via iTime.live API (PTB caesium fountain clocks)
- NTP-style multi-sample minimum-RTT algorithm (~30-50ms accuracy)
- Auto timezone detection
- 12/24 hour toggle (persisted to localStorage)
- Brutalist design aesthetic — zero border radius, hard shadows, dot grid
- Fully responsive: mobile portrait/landscape, tablet, desktop, TV
- Re-syncs every 10 minutes + on tab re-focus
- Live sync status indicator

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview  # preview production build locally
```

## Deployment

Push to GitHub and connect to Vercel — it auto-detects Vite projects.

## Tech Stack

- Vite
- Vanilla HTML/CSS/JS (no framework)
- Tailwind CSS v4
- Space Grotesk + Inter (Google Fonts)

## How It Works

The app uses the same synchronization algorithm as time.gov:

1. Makes 5 parallel HTTP requests to iTime.live's atomic clock API
2. Records `performance.now()` before and after each request
3. Selects the sample with the lowest round-trip time (least network jitter)
4. Estimates one-way delay as half the RTT
5. Computes offset between server atomic time and local clock
6. Applies offset to `Date.now()` for all subsequent display updates
7. Re-syncs every 10 minutes to account for local oscillator drift

Falls back to timeapi.io if iTime.live is unreachable.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
