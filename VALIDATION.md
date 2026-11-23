# Tikset 0.8.1 tab recovery

November 23, 2026. Tested the built site in Chrome on Windows against the local time API with live NTP upstreams. A second tab covered the clock. Chrome reported the hidden, frozen, resumed and visible events in order.

- Switching away cancelled a deliberately stalled request. The hidden tab subsequently completed a regular network refresh with 12 same-origin requests.
- Returning after a browser freeze produced a fresh computer-clock comparison in 4.4 seconds. Cloudflare and NIST readings were within 1 ms of each other. The manual recheck button was enabled.
- With network requests deliberately failing on return, the page reported that it needed a fresh reference and withheld the computer-clock comparison. Restoring fetch without sending an online event or clicking the button let the early retry recover automatically. The full failure-and-recovery sequence took 14.7 seconds.
- Deterministic tests simulate four hours passing with an unresolved response and a device-clock change, and four hours of sleep during which the monotonic clock stops. Both recover the injected reference and device offset. Additional tests cover delayed timers, a stalled optional provider, the full-check timeout, and offline cancellation.

All 85 tests, formatting checks and a clean production build passed. The four-hour elapsed interval was simulated. Browser freezing and tab switching were exercised directly.

---

# Tikset 0.8.0 validation

November 23, 2026, on one Windows workstation in Chromium.

| Check | Result |
| --- | --- |
| Identical synthetic exchanges, 500 seeded rounds | Moving receipt to the verified timestamp header reduced median absolute offset error from 1.30 to 0.80 ms and the 95th percentile from 3.71 to 3.17 ms. Outbound and inbound delays vary independently, with 0–5 ms of additional body delay. |
| Delayed body, known clock | Adding exactly 200 ms after the stamped headers moved the previous estimate 100 ms behind. The revised estimate stayed at the injected time. An older server without the header still uses the complete body. |
| Sudden path asymmetry | A corroborated precise burst prevented a subsequent asymmetric burst from moving the displayed estimate by 75 ms. Elapsed uncertainty grew. On the following noisy round the older precise sample aged out. |
| Local app, real upstream NTP | At 01:07 CDT the computer comparison read 115 ms ahead, with a 92–138 ms range. A separate read-only Windows NTP check against time.windows.com measured 115.3 ms ahead with a 14.5 ms round trip. |
| Public network path | At 01:21:34 CDT the revised Chromium client read 106 ms ahead using the two public tikset.com NTP routes. Its device range was 61–151 ms ahead and its reference range was ±43.7 ms. Cloudflare and NIST estimates were 3 ms apart. An independent Windows sample in the same second measured 116.5 ms ahead with a 19.0 ms round trip and 10.1 ms of reported root dispersion. |

The public path used the deployed API’s compatible body-timestamp protocol. The local app exercised the new header end to end. Local loopback eliminates most of the browser-to-server path. Neither live measurement establishes absolute UTC accuracy or the instant the screen changed.

Deterministic tests cover source replacement and hysteresis, delayed device reads, repeated-check advice, coarse public timestamps, one wide peer, and stale or conflicting evidence. Desktop and 390 × 844 Chromium checks exercised the pop-out and manual recheck. Hardware display latency and other browser engines were outside this measurement.

---

# Tikset 0.7.0 validation

September 15, 2026. Version 0.7.0 adds NIST and provider-majority selection, preserving Cloudflare preference within the supported group.

- 64 tests pass, including a bad primary replaced with eight fresh samples, comparison outliers, tied clusters, duplicate votes, fresh validation before rejecting a new measurement, and NIST caching/polling guards. Existing clock and scheduler regression tests remain passing.
- Native local browser test: injected a one-second error into Cloudflare responses. NIST, time.now and timeapi.io formed the unique majority; Tikset selected NIST with 8/8 samples, disclosed Cloudflare's exclusion, and displayed about 66 ms of computer error rather than the injected one-second error. Reload removed the injection; Cloudflare returned as the selected source.
- Local live measurements from both NTP providers succeeded. Cloudflare was preferred even when the NIST range was smaller.
- Vercel preview `time-edvd621gx-realemmetts.vercel.app` successfully served both routes. Representative upstream ranges: Cloudflare ±9.59 ms with 1.04 ms RTT; NIST ±22.70 ms with 38.72 ms RTT. NIST reported stratum 1. The browser selected Cloudflare, accepted 8/8 samples, and showed four agreeing providers with a combined range around ±51 ms. No preview console warnings/errors were observed.
- Controlled stable-drift cases at ±30 and ±80 ppm improve the following minute's rate estimate by more than 90% after qualification. Zero, uncertainty-dominated, oscillating and excessive drift leave correction disabled. The supported rate closest to zero is used after three successful subsequent predictions; this avoids aggressive extrapolation. Actual live drift correction has not been demonstrated in this short session and remains inactive without sufficient evidence.
- Production release is gated on preview qualification, passing CI and post-deployment public checks. Numerical ranges describe this session, not a UTC or physical-screen accuracy guarantee. Platform limitations from the 0.6.0 validation below still apply.

---

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
