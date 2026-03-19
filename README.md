# ATOMIC TIME

A beautiful, brutalist atomic clock web app — a modern alternative to [time.gov](https://time.gov).

Built by [SHAUGHV](https://shaughv.com) | [QubeTX](https://qubetx.com) | [emmetts.dev](https://emmetts.dev)

## Features

- **Atomic clock sync** via iTime.live API (PTB caesium fountain clocks, Germany)
- **NTP-style accuracy** — multi-sample minimum-RTT algorithm (~30-50ms)
- **Corrected offset** — compensates for your device's clock drift in real time
- **Auto timezone detection** — no permissions needed (Intl API with geolocation fallback)
- **12/24 hour toggle** — persisted to localStorage
- **Comprehensive sync tooltip** — tap or hover for detailed accuracy info:
  - 15 RTT tiers, 15 offset tiers, 12 watch-setting guidance tiers
  - Dynamic, plain-English explanations with real-world analogies
- **Fully responsive** — mobile portrait (stacked), landscape, tablet, desktop, TV
- **Brutalist design** — zero border radius, hard shadows, dot grid, Space Grotesk
- **Re-syncs every 10 minutes** + on tab re-focus
- **SHAUGHV branding** — favicon + footer logo

## How It Works

Uses the same synchronization algorithm as time.gov (the official U.S. atomic clock):

1. Makes 5 sequential HTTP requests to an atomic-clock-synced server
2. Records `performance.now()` before and after each request for high-resolution RTT
3. Selects the sample with the **lowest round-trip time** (least network jitter)
4. Estimates one-way delay as half the RTT
5. Computes offset: `serverTime - clientMidpoint`
6. Applies offset to `Date.now()` for all display updates
7. Re-syncs every 10 minutes to account for local oscillator drift

**Primary source:** [iTime.live](https://itime.live) — PTB (Germany) atomic clocks
**Fallback:** [timeapi.io](https://timeapi.io) — NTP-synced server

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deployment

Push to GitHub and connect to Vercel — it auto-detects Vite projects.

## Tech Stack

- Vite
- Vanilla HTML/CSS/JS (no framework)
- Tailwind CSS v4
- Space Grotesk + Inter (Google Fonts)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

---

A [SHAUGHV](https://shaughv.com) project by [Emmett](https://emmetts.dev) | Powered by [QubeTX](https://qubetx.com)
