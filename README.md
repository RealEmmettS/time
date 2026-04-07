# ATOMIC TIME

A beautiful, brutalist atomic clock web app — a modern alternative to [time.gov](https://time.gov). Hosted at [tikset.com](https://tikset.com).

Built by [SHAUGHV](https://shaughv.com) | [QubeTX](https://qubetx.com) | [emmetts.dev](https://emmetts.dev)

## Features

- **Atomic clock sync** via iTime.live API (PTB caesium fountain clocks, Germany)
- **NTP-style accuracy** — multi-sample minimum-RTT algorithm (~30-50ms)
- **Corrected offset** — compensates for your device's clock drift in real time
- **Auto timezone detection** — no permissions needed (Intl API with geolocation fallback)
- **12/24 hour toggle** — persisted to localStorage
- **212-tier sync quality analysis** — tap or hover the sync pill for a detailed breakdown:
  - 100 RTT tiers, 100 device offset tiers, 12 watch-setting guidance tiers
  - Binary search classification with logarithmically distributed thresholds
  - Combined uncertainty scoring for practical watch-setting advice
  - Every description dynamically interpolates your actual measured values
  - 30+ scientifically fact-checked analogy constants (peer-reviewed sources)
  - Conflict-free composition: analogy tags + domain categories prevent contradictions across sections
  - `humanFraction()` algorithm converts ms to natural English fractions ("an eighth of a second")
- **Live tab title** — browser tab shows the corrected atomic time every second, even from other tabs
- **Pretext-powered responsive sizing** — `@chenglou/pretext` dynamically measures clock text and scales digits to fill the viewport width at every size, from tiny phones to ultrawide monitors. CSS `clamp()` retained as fallback.
- **Watch SVG decorations** — faint wristwatch watermark behind the clock digits + clipped watch-band illustration in the sync status pill (Quiver AI-generated)
- **Fully responsive** — mobile portrait (stacked HH:MM / SS), landscape, tablet, desktop, TV
- **Brutalist design** — zero border radius, hard shadows, dot grid, Makira Sans Serif + Space Grotesk
- **Re-syncs every 10 minutes** + on tab re-focus after 2+ minutes hidden
- **SHAUGHV branding** — custom SVG favicon + footer logo

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

## Under the Hood

This looks like a simple clock. It isn't.

Behind one HTML page and a handful of vanilla JS modules, ATOMIC TIME packs:

- **A binary search tier classification engine** — 212 tier objects across three axes (RTT, device offset, combined uncertainty) with logarithmically distributed thresholds (100/100/12). Classification runs in O(log n) via right-bisect, resolving in at most 7 comparisons per axis. The data architecture fully separates classification logic from content, so adding a tier is one number and one object — no logic changes.

- **Conflict-free analogy composition** — every tier description is tagged with the real-world analogies it uses (eye blink, heartbeat, gaming latency, etc.) and a domain category (biology, animal, technology, physics, space). All 100 offset tiers carry an alternate description from a different domain. When the tooltip renders, a two-tier conflict resolver ensures no two sections contradict each other (hard conflict: same analogy with different values) or feel redundant (soft conflict: same domain). All analogy values are backed by 30+ verified constants sourced from peer-reviewed literature — no more "an eye blink takes 70ms" (it doesn't).

- **A natural fraction algorithm (`humanFraction`)** — converts raw millisecond uncertainty into the closest natural-sounding English fraction using a denominator whitelist (halves, thirds, quarters, fifths, sixths, eighths, tenths). Prefers simpler fractions via a complexity penalty, falls back to plain numbers outside the fraction-friendly range. Replaces hardcoded approximations like "about a quarter second" for 140ms (which was nearly 2x wrong).

- **An NTP-style multi-sample sync algorithm** — 5 sequential HTTP samples, minimum-RTT selection, midpoint-based offset calculation. The same approach the U.S. government uses at time.gov, implemented in ~100 lines of JS. Cache-busting headers prevent CDN interference. Fallback endpoint switching is automatic.

- **A combined uncertainty model for watch-setting guidance** — instead of a crude RTT/offset matrix, the watch guidance axis uses a single derived score: `(RTT / 2) + |offset|`. This flattens two dimensions into one, enabling the same binary search as the other axes while giving a physically meaningful "worst-case total error" number.

- **A 20ms render loop** — not `requestAnimationFrame` (which skips background tabs), but `setInterval` at 20ms, matching time.gov's own approach. DOM updates are batched: time updates only when the second changes, metadata only when the minute changes.

- **Pretext-powered dynamic sizing** — `@chenglou/pretext` measures clock text via Canvas at runtime, then scales `fontSize` to fill the viewport width minus responsive padding (24px mobile, 6% tablet, 12% TV). A RAF-gated resize listener re-measures on every window resize without ResizeObserver. The sync pill also uses Pretext to auto-size its width after every status change, keeping text from overlapping the decorative watch SVG.

- **Near-zero dependencies** — just Tailwind and Pretext (~3KB gzipped). No React, no framework, no state library. ES modules, `EventTarget` for pub/sub, and `localStorage` for the 12/24h preference.

## Live At

- [tikset.com](https://tikset.com) (production)
- [time.shaughv.com](https://time.shaughv.com)
- [time.emmetts.dev](https://time.emmetts.dev)
- [qxtik.com](https://qxtik.com)

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

Auto-deploys to Vercel on push to `main` via GitHub Actions.

## Tech Stack

- Vite
- Vanilla HTML/CSS/JS (no framework)
- Tailwind CSS v4
- [@chenglou/pretext](https://github.com/chenglou/pretext) (dynamic text measurement)
- Makira Sans Serif (self-hosted, headlines/body) + Space Grotesk (Google Fonts, clock digits)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

---

A [SHAUGHV](https://shaughv.com) project by [Emmett](https://emmetts.dev) | Powered by [QubeTX](https://qubetx.com)
