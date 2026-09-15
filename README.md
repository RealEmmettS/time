# ATOMIC TIME

Network-corrected time for setting watches, with a separate check of your computer clock. Hosted at [tikset.com](https://tikset.com).

Built by [SHAUGHV](https://shaughv.com) / [QubeTX](https://qubetx.com).

## What the clock measures

The page estimates the difference between a time server and the browser's elapsed-time clock. It advances that reference independently of operating-system clock corrections, then compares it with the device clock to report ahead/behind.

- A same-origin Vercel Node.js endpoint references time.cloudflare.com over NTP, then supplies corrected handler-entry and response-generation timestamps.
- Eight samples establish the reference; time.now and timeapi.io provide periodic cross-checks.
- Conflicting sources or ambiguous samples are reported instead of silently publishing a new reference.
- The visible tick is scheduled at corrected second boundaries using foreground animation frames.
- The diagnostics explain computer-clock difference, both network paths, upstream uncertainty, freshness, source agreement, and browser scheduling. OS-specific setup help shows Windows, macOS, or Linux instructions one at a time.
- The existing responsive clock, timezone handling, branding, and saved 12/24-hour preference are preserved.

**This is an internet time-of-day reference, not a calibrated atomic clock.** The primary range includes the browser path and Cloudflare NTP path plus Cloudflare-reported root uncertainty. This is not certified UTC accuracy; fallback sources have unknown UTC error, and all ranges exclude physical display latency. A timestamp with many decimal places does not establish corresponding accuracy. See [METHODOLOGY.md](METHODOLOGY.md) for assumptions, equations, failure handling, and validation.

## Development

```sh
npm ci
npm run dev
npm test
npm run check
npm run build
```

Vite serves the UI locally; it does not run Vercel Functions. Without a deployed primary API, local development uses the configured public fallback sources. Validate the complete primary protocol on a Vercel preview. Do not use a local server's system clock as an independent time reference.

```sh
node scripts/compare-timing.mjs
node scripts/compare-timing.mjs https://YOUR-PREVIEW.vercel.app
```

The first comparison uses deterministic synthetic delays. The second replays the same live exchanges through the legacy and revised estimators; it requires an accessible preview and does not establish absolute UTC accuracy.

## Deployment

Vercel hosts both the static Vite build and `/api/time`. The existing GitHub integration deploys `main` to production. Qualify changes on a preview first. CI runs the timing/recovery tests, formatting checks, and production build.

This HTTPS endpoint cannot replace the NTP server configured in Windows. The website does not change the operating system's clock.

## Stack

Vanilla JavaScript ES modules, Vite, Tailwind CSS, and Pretext for responsive text sizing. Makira is self-hosted; Space Grotesk is used for clock digits.

See [CHANGELOG.md](CHANGELOG.md).
