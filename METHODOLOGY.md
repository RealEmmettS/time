# Tikset timing methodology — 0.6.0

## Objective and boundaries

Provide a dependable internet time-of-day reference for watch setting and estimate device-clock error. The target is practical browser accuracy comparable with time.gov; no measured parity or absolute UTC guarantee is implied. We do not use time.gov's internal endpoints. [NIST describes its transfer method and restrictions](https://www.nist.gov/pml/time-and-frequency-division/about-timegov).

Vercel provides the existing HTTPS backend using its default Node.js runtime, which supports the outbound UDP used for NTP. The backend references time.cloudflare.com instead of trusting the hosting wall clock. Cloudflare reports NTP root delay/dispersion, stratum and leap state; those are source-reported metadata, not independently certified UTC-error bounds. Public fallback providers do not supply a verified UTC-error bound. Agreement between these services is corroboration only; they may share upstream errors. Unknown source accuracy remains unknown. Different leap-smear behavior can appear as source disagreement; do not combine incompatible source clocks.

## Transfer protocol

`GET /api/time?requestId=<identifier>` returns `{version:1, requestId, receivedAt, sentAt, timestamp}`. Epoch timestamps are milliseconds; `timestamp` equals `sentAt` for old clients. The response also includes `source` metadata: name, protocol, authentication flag, uncertainty/age, residual NTP delay, root delay/dispersion, stratum and leap indicator. The handler records monotonic entry time and time immediately before serialization, then maps both to the same Cloudflare-derived epoch reference. These are application timestamps, not packet or hardware timestamps. Platform queueing before entry and transport/serialization after the last stamp remain in measured path delay. Cache headers forbid storage, and the client rejects positive Age, wrong protocol/identifier, invalid timestamps and impossible durations. The request identifier detects accidental replay/caching, not a malicious source. HTTPS authenticates transport.

For client monotonic send/complete-body times `m1,m4`, and server epoch stamps `s2,s3`:

- Round trip: `rtt = m4 - m1`.
- Handler processing: `p = s3 - s2`.
- Residual delay: `d = max(0, rtt - p)`.
- Reference epoch-minus-monotonic estimate: `b = ((s2-m1)+(s3-m4))/2`.
- Interval: `b ± (d/2 + 2q)`, with timing floor `q >= 1 ms`.

The midpoint assumes symmetric paths; the interval permits unequal nonnegative path delays. Processing greater than RTT plus rounding allowance, backward timestamps and exchanges over three seconds are rejected. Body receipt is measured before JSON parsing. Fallbacks have one timestamp, so `s2=s3` and processing remains in the interval. Fractional UTC milliseconds are retained, without suggesting equivalent accuracy.

Browser timer granularity is probed briefly. A timer that does not advance during the probe receives a conservative 100 ms floor. This is a resolution heuristic, not timer calibration. The backend uses submillisecond NTP/monotonic timestamps, while the browser retains a minimum 1 ms timing floor. Other source errors remain possible.

## Vercel-to-Cloudflare measurement

The backend sends NTPv4 client packets to the fixed host time.cloudflare.com on UDP port 123. A connected socket limits replies to that resolved peer; a random 64-bit transmit cookie must match the returned origin field. Validate mode, version, leap state, stratum, root metrics, packet length, timestamp order and processing duration. Handle the 2036 NTP era rollover using the hosting date only for era selection. Queries close sockets on completion/error and time out after 1.5 seconds.

Use the same four-timestamp transfer equations as the browser, with monotonic client times. The per-exchange upstream range includes residual NTP delay/2, nonnegative root delay/2, root dispersion, and at least 1 ms precision allowance. Three consistent samples establish the reference; select the sample with the smallest complete uncertainty without narrowing shared upstream errors through averaging.

A function instance caches this monotonic reference for at most 60 seconds, shares concurrent refreshes and backs off for 60 seconds on failure. Add 100 ppm elapsed-time allowance; invalidate cache on detectable host clock/monotonic discontinuity. Instances do not share a distributed cache, so cold instances each perform their own three-query refresh. On NTP failure, `/api/time` returns 503 and the browser falls back to public HTTPS sources. It never labels uncorrected Vercel host time as Cloudflare.

After browser interval fusion, add the maximum upstream range reported in that sample group. This preserves common upstream uncertainty rather than averaging it away. Diagnostics separate browser transfer, upstream reference and elapsed drift, and show their combined estimate. Ordinary NTP is not cryptographically authenticated NTS; packet correlation and HTTPS do not establish authenticated upstream time. Cloudflare does not smear leap seconds; source disagreements are never averaged away. [Cloudflare NTP documentation](https://developers.cloudflare.com/time-services/ntp/) and [Vercel Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js).

## Sampling and selection

Drain one warm-up response, then take eight sequential samples 50 ms apart from the selected reference endpoint. Try Vercel first, then time.now, then timeapi.io if no usable reference is obtained. Two initial failures stop an unavailable endpoint early. Cross-check endpoints receive a warm-up and two measurements. No parallel measurement traffic competes within a synchronization cycle.

Intersect sample intervals in a common monotonic frame with an elapsed-time drift allowance. Select the unique maximum-overlap region only if it has a strict majority of successful samples, with at least two successful samples. Equal disjoint maxima are ambiguous and rejected. Zero, negative and touching intervals are supported. Uncertainty cannot shrink below the quantization floor. Sample variation is the standard deviation before rejection; accepted/attempted counts are reported separately. No statistical confidence percentage is claimed.

Cross-check all available source intervals for pairwise consistency. Keep the first usable source in priority order as the reference; never average providers. A disagreement prevents publication of the candidate. A previous valid reference continues with an explicit conflict warning; initial conflicts leave the page on uncorrected device time. A unavailable comparison source qualifies the result, rather than making the entire clock unavailable.

## Clock lifecycle

Advance the accepted epoch using `performance.now()` elapsed time. Compare this value with `Date.now()` only for the device diagnosis. Device clock changes during or after measurement cannot directly change the reference. A successful new network check may step the reference; no gradual correction is used that knowingly leaves the watch-setting display behind the accepted estimate.

Refresh the reference every minute while visible. Cross-check on startup, explicit recheck, return/reconnect, and every ten minutes. A one-second continuity probe detects wall/monotonic divergence and execution gaps over five seconds. Invalidate in-flight generations across interruptions; a queued fresh check supersedes them. Requests are deduplicated, including preserving explicit full-check requests during a primary-only refresh.

Increase the displayed reference uncertainty by an assumed 100 ppm (0.1 ms/s) oscillator allowance. This is a conservative modeling default, not a guaranteed bound for every device. Beyond 90 seconds the reference is stale. A failed refresh marks it stale immediately. Sleep behavior differs among platforms, so resume requires a new measurement even if an elapsed clock appears intact. The stale reference may be wrong after interrupted timing; watch guidance explicitly asks the user to wait.

The device error interval adds the measured wall-clock resolution floor to the combined transfer estimate. If it spans zero, report no difference detected within measurement uncertainty. With a sole source, name that source. Neither this message nor source agreement proves that the device is within a specified distance of UTC.

## Visible ticks

Wake 50 ms before the next corrected second boundary, then render on the first animation frame where the current reference has crossed it. Read current time inside the callback; do not use a potentially earlier animation-frame timestamp. After a stall, skip to the actual current second and schedule the next absolute boundary. Hidden tabs use boundary timers and redraw on return. Render date metadata using the full epoch minute so jumps by whole minutes/hours cannot leave it stale.

The last 120 callback lateness and near-boundary frame-gap measurements are summarized in diagnostics. These stop before browser paint, display scanout and hardware latency. They are not a physical-screen accuracy measurement. Human reaction and watch mechanics also affect setting accuracy.

## Validation

`npm test` injects monotonic/wall clocks, HTTP transport and render scheduling. It covers the legacy cluster-selection bug, asymmetric paths, processing/body delays, coarse timers, known device errors, OS corrections, stale/offline/conflict states, fallback, request correlation, concurrency and suspension. Render tests include main-thread stalls and day rollover.

`node scripts/compare-timing.mjs` compares both estimators over identical seeded synthetic inputs. An optional HTTPS preview URL collects paired real exchanges. The legacy estimator is read from repository commit `20652b3`. Synthetic truth can test interval containment and estimator bias; live stability cannot establish absolute accuracy.

Independent NTP probes are read-only and never set the computer clock. Their uncertainty and the observation time must accompany comparisons. Manual time.gov comparison is a coarse visual sanity check, not a submillisecond calibration. Windows/browser, macOS/Safari, real mobile, and physical-display validation are separate acceptance surfaces; document unavailable checks.

## Local clock help

Detect the OS from available browser hints without transmitting them. Android/iOS and desktop-mode iPad are not treated as Linux/macOS; unknown systems require a manual choice. Users can override the selected platform. Linux instructions branch by the synchronization service the user verifies locally, since the browser cannot inspect it. This feature only displays instructions; it never changes system settings.

Windows/macOS steps follow the current [Cloudflare setup guide](https://developers.cloudflare.com/time-services/ntp/usage/) and [Apple guide](https://support.apple.com/guide/mac-help/mchlp2996/mac). Linux guidance preserves the active service and notes distribution-specific configuration. Changing sources is optional; successful regular synchronization and checking the result matter more than the provider name.
