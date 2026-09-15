# Tikset 0.6.0 validation

September 15, 2026. Measurements below describe this Windows connection and test session; they are not a UTC accuracy guarantee.

## Automated checks

- 49 deterministic tests pass, including fusion regressions, asymmetric paths, full-body receipt, upstream error propagation through the actual default endpoint configuration, operating-system clock steps, stale/conflicting sources, overlapping requests, recovery, UDP failures, and second-boundary scheduling.
- Formatting checks and the production build pass locally and in GitHub Actions.
- The local Vite server runs the same Cloudflare-backed handler as Vercel, so frontend/backend integration is testable with `npm run dev`.

## Local browser checks

Windows Chromium: integrated Cloudflare reference, eight accepted primary samples, both independent HTTP cross-checks available. Observed browser range around ±3 ms plus upstream range around ±24–27 ms. This loopback result is not representative of internet transport.

Verified desktop and 390 × 844 responsive layouts, a scrolling diagnostics panel, automatic Windows help, manual macOS/Linux selection, saved 12/24-hour preference, Check again, keyboard disclosure and Escape (including during an active check). Offline simulation retained the reference with a provisional status and automatically recovered after reconnection. A 1.3-second main-thread stall skipped to the current second. Deterministic tests verify subsequent boundaries do not accumulate drift and cover minute/day rollover and suspend behavior.

Local integration found and fixed a missing default upstream flag that otherwise omitted Cloudflare uncertainty. Earlier browser validation found and fixed native timer invocation and active-recheck Escape handling.

## Vercel preview

Deployment `time-jxtg0vv0z-realemmetts.vercel.app`, commit `7724b5f`, successfully queried Cloudflare over UDP. A representative response reported NTP round trip 1.048 ms, server processing 0.075 ms, residual network delay 0.973 ms, and upstream range ±8.807 ms including reported root uncertainty and cache age. Uncached protocol fields and request correlation passed.

In six paired rounds using the same eight HTTPS exchanges for both estimators:

| Measurement | Previous estimator | Revised estimator |
| --- | --- | --- |
| Median estimated device offset | +73.54 ms | +73.14 ms |
| Offset range across rounds | +69.83 to +74.81 ms | +69.49 to +74.50 ms |
| Median browser exchange uncertainty | ±40.84 ms | ±43.10 ms |
| Median combined uncertainty | Not represented | ±52.76 ms |
| Accepted rounds | 6/6 | 6/6 |

Revised combined ranges were ±48.76–54.13 ms. Median sampling duration was 1.398 seconds and median fastest round trip was 83.88 ms. Explicit timing floors and upstream accounting can make the reported range wider; a smaller displayed number is not the objective. The live comparison does not know absolute UTC error.

The foreground preview browser separately reported eight of eight accepted samples, agreement across all three sources, a computer clock about 65 ms behind, a total range around ±46 ms, 7 ms median / 9 ms p95 callback lateness, and 17 ms sampled frame cadence. No browser warning/error logs were observed in that check. These callback measurements exclude physical display latency.

## Independent checks and limits

- Read-only Windows `w32tm /stripchart /computer:time.windows.com /samples:3 /period:3 /dataonly` at 01:13:41–47 CDT measured +53.514, +54.641 and +54.117 ms. This independently implemented NTP client and separate provider support the website's range; the computer's settings were not modified.
- The normal time.gov website and preview both displayed 01:13:28 CDT in a consecutive-page spot check. time.gov displayed device error −0.033 s. No internal time.gov endpoint was consumed by an outside application. A page spot check is not a calibrated simultaneous screen measurement.
- Five hundred seeded synthetic trials with known truth reduced median estimator error from 5.88 to 1.30 ms (p95 13.36 to 3.71 ms) under the script's stated delay distribution. This is algorithm validation, not a promised real-world improvement.
- Real Safari/macOS, Linux desktop browsers, mobile hardware, physical sleep/wake, and instrumented display latency were unavailable. OS transitions and recovery were simulated; OS instructions were checked against official documentation. Timestamp resolution, NTP root uncertainty, network assumptions, unknown source error, and display delay remain distinct limits.

See [METHODOLOGY.md](METHODOLOGY.md) for the model and `scripts/compare-timing.mjs` for the paired benchmark. Raw local reports are under ignored `.cache/validation/` and contain no preview authentication cookies.
