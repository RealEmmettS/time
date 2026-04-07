// Copyright QubeTX — tikset.com

/**
 * AtomicClockSync — Synchronizes browser clock with atomic time via HTTPS APIs.
 *
 * Multi-sample sync with IQR outlier filtering and Marzullo's interval fusion
 * algorithm (same family as NTP's intersection algorithm).
 *
 * Endpoint priority:
 *   1. Self-hosted Vercel Edge Function (same-origin, ~5-20ms RTT)
 *   2. time.now/developer API (BunnyCDN, ~63ms RTT, microsecond precision)
 *   3. timeapi.io (NTP-synced, ~146ms RTT, proven reliable)
 *
 * Achievable accuracy: ~3-30ms depending on endpoint and network conditions.
 */

const ENDPOINTS = [
  {
    name: "Vercel Edge",
    label: "Vercel Edge (NTP-synced)",
    url: "/api/time",
    parseTimestamp: (data) => data.timestamp,
  },
  {
    name: "time.now",
    label: "Atomic Time API (time.now)",
    url: "https://time.now/developer/api/timezone/Etc/UTC",
    parseTimestamp: (data) => new Date(data.utc_datetime).getTime(),
  },
  {
    name: "timeapi.io",
    label: "NTP Server (timeapi.io)",
    url: "https://timeapi.io/api/time/current/zone?timeZone=UTC",
    parseTimestamp: (data) => new Date(data.dateTime + "Z").getTime(),
  },
];

// ─── Statistical Helpers ────────────────────────────────────

/**
 * IQR-based outlier filter. Removes samples with RTT above Q3 + 1.5 * IQR.
 * Returns the filtered subset (at least 2 samples preserved).
 */
function filterOutliers(samples) {
  if (samples.length < 4) return samples;

  const sorted = [...samples].sort((a, b) => a.rtt - b.rtt);
  const q1Idx = Math.floor(sorted.length * 0.25);
  const q3Idx = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Idx].rtt;
  const q3 = sorted[q3Idx].rtt;
  const iqr = q3 - q1;
  const upperFence = q3 + 1.5 * iqr;

  const filtered = sorted.filter((s) => s.rtt <= upperFence);
  // Preserve at least 2 samples even if filtering is aggressive
  return filtered.length >= 2
    ? filtered
    : sorted.slice(0, Math.max(2, Math.ceil(sorted.length / 2)));
}

/**
 * Marzullo's algorithm — finds the tightest time interval consistent with
 * the maximum number of overlapping confidence intervals.
 *
 * Each sample produces an interval: [offset - rtt/2, offset + rtt/2]
 * The algorithm sweeps left-to-right to find the densest overlap region.
 *
 * Returns { offset, uncertainty } where:
 *   offset = midpoint of the densest intersection
 *   uncertainty = half-width of that intersection (tighter than any single RTT/2)
 */
function marzullo(samples) {
  if (samples.length === 0) return null;
  if (samples.length === 1) {
    return { offset: samples[0].offset, uncertainty: samples[0].rtt / 2 };
  }

  // Build endpoint events: +1 for interval start, -1 for interval end
  const events = [];
  for (const s of samples) {
    const halfRtt = s.rtt / 2;
    events.push({ time: s.offset - halfRtt, delta: 1 });
    events.push({ time: s.offset + halfRtt, delta: -1 });
  }

  // Sort: by time ascending; starts (+1) before ends (-1) at same time
  events.sort((a, b) => a.time - b.time || b.delta - a.delta);

  // Sweep to find the region with maximum overlap
  let current = 0;
  let maxOverlap = 0;
  let bestStart = 0;
  let bestEnd = 0;
  let regionStart = 0;

  for (const event of events) {
    current += event.delta;
    if (current > maxOverlap) {
      maxOverlap = current;
      regionStart = event.time;
    } else if (current < maxOverlap && maxOverlap > 0) {
      // Just exited a max-overlap region — record it if it's the first
      if (bestStart === 0 && bestEnd === 0) {
        bestStart = regionStart;
        bestEnd = event.time;
      }
    }
  }

  // If no clear region found (shouldn't happen), fall back to the region we tracked
  if (bestStart === 0 && bestEnd === 0) {
    bestStart = regionStart;
    // Find the end of the max-overlap region
    current = 0;
    for (const event of events) {
      current += event.delta;
      if (current === maxOverlap) {
        bestStart = event.time;
      } else if (current < maxOverlap && bestStart !== 0) {
        bestEnd = event.time;
        break;
      }
    }
  }

  // If still degenerate, fall back to min-RTT sample
  if (bestEnd <= bestStart) {
    const best = samples.reduce((a, b) => (a.rtt < b.rtt ? a : b));
    return { offset: best.offset, uncertainty: best.rtt / 2 };
  }

  return {
    offset: (bestStart + bestEnd) / 2,
    uncertainty: (bestEnd - bestStart) / 2,
  };
}

// ─── Main Class ─────────────────────────────────────────────

export class AtomicClockSync extends EventTarget {
  constructor() {
    super();
    this.offset = 0;
    this.uncertainty = 0;
    this.lastSync = 0;
    this.lastRtt = 0;
    this.status = "idle"; // idle | syncing | synced | error
    this._timer = null;
    this._activeEndpoint = ENDPOINTS[0];
  }

  /**
   * Perform a multi-sample sync with IQR filtering and Marzullo fusion.
   * Tries each endpoint in priority order until one succeeds.
   * @param {number} samples — Number of samples per endpoint attempt
   * @returns {Promise<{offset: number, rtt: number, uncertainty: number, confidence: string, endpoint: object}>}
   */
  async sync(samples = 8) {
    this._setStatus("syncing");

    for (const endpoint of ENDPOINTS) {
      try {
        const result = await this._syncEndpoint(endpoint, samples);
        if (result) {
          this._activeEndpoint = endpoint;
          this.offset = result.offset;
          this.uncertainty = result.uncertainty;
          this.lastRtt = result.rtt;
          this.lastSync = Date.now();
          this._setStatus("synced");

          const confidence = this._assessConfidence(result.rtt);
          const syncResult = {
            offset: Math.round(result.offset * 100) / 100,
            rtt: Math.round(result.rtt * 100) / 100,
            uncertainty: Math.round(result.uncertainty * 100) / 100,
            samplesUsed: result.samplesUsed,
            confidence,
            endpoint,
          };

          console.log(
            `[AtomicSync] Synced via ${endpoint.name}: offset=${syncResult.offset}ms, RTT=${syncResult.rtt}ms, uncertainty=±${syncResult.uncertainty}ms, samples=${syncResult.samplesUsed}, confidence=${confidence}`,
          );

          return syncResult;
        }
      } catch (e) {
        console.warn(`[AtomicSync] ${endpoint.name} failed:`, e.message);
      }
    }

    this._setStatus("error");
    throw new Error("All sync endpoints failed");
  }

  /**
   * Sync against a single endpoint: warm → sample → filter → fuse.
   */
  async _syncEndpoint(endpoint, sampleCount) {
    // Phase 1: Connection pre-warming (throwaway fetch)
    try {
      const warmUrl = `${endpoint.url}${endpoint.url.includes("?") ? "&" : "?"}_w=${Date.now()}`;
      await fetch(warmUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Warm-up failed — endpoint is likely down
      return null;
    }

    // Phase 2: Collect samples on warm connection
    const results = [];
    for (let i = 0; i < sampleCount; i++) {
      try {
        const result = await this._sample(endpoint);
        results.push(result);
      } catch (e) {
        console.warn(
          `[AtomicSync] ${endpoint.name} sample ${i + 1} failed:`,
          e.message,
        );
        // If first real sample fails after warm-up, endpoint is flaky
        if (i === 0 && results.length === 0) return null;
      }

      // Short delay between samples (50ms, down from 200ms)
      if (i < sampleCount - 1) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    if (results.length < 2) return null;

    // Phase 3: IQR outlier filtering
    const filtered = filterOutliers(results);

    // Phase 4: Marzullo's algorithm for interval fusion
    const fused = marzullo(filtered);
    if (!fused) return null;

    // Best RTT for display (from the min-RTT sample in filtered set)
    const bestRtt = Math.min(...filtered.map((s) => s.rtt));

    return {
      offset: fused.offset,
      uncertainty: fused.uncertainty,
      rtt: bestRtt,
      samplesUsed: filtered.length,
    };
  }

  async _sample(endpoint) {
    const t1 = performance.now();
    const localBefore = Date.now();

    const bustUrl = `${endpoint.url}${endpoint.url.includes("?") ? "&" : "?"}_=${Date.now()}`;
    const response = await fetch(bustUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });

    const t2 = performance.now();
    const localAfter = Date.now();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const serverMs = endpoint.parseTimestamp(data);

    if (!serverMs || isNaN(serverMs)) {
      throw new Error("Invalid timestamp from server");
    }

    // High-resolution RTT for sample quality ranking
    const rtt = t2 - t1;
    // offset = serverTime - clientMidpoint (Cristian's algorithm)
    const localMidpoint = (localBefore + localAfter) / 2;
    const offset = serverMs - localMidpoint;

    return { offset, rtt };
  }

  _assessConfidence(rtt) {
    if (rtt < 50) return "high";
    if (rtt < 150) return "medium";
    if (rtt < 300) return "fair";
    return "low";
  }

  /** Get the current atomic-corrected time. */
  now() {
    return new Date(Date.now() + this.offset);
  }

  /** Get corrected Unix timestamp in milliseconds. */
  nowMs() {
    return Date.now() + this.offset;
  }

  /**
   * Start periodic re-synchronization.
   * @param {number} intervalMs — Re-sync interval (default 10 minutes)
   */
  startAutoSync(intervalMs = 600_000) {
    this.sync().catch(() => {}); // Initial sync
    this._timer = setInterval(() => {
      this.sync().catch(() => {});
    }, intervalMs);
  }

  stopAutoSync() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  getStatus() {
    return {
      status: this.status,
      offset: Math.round(this.offset * 100) / 100,
      rtt: Math.round(this.lastRtt * 100) / 100,
      uncertainty: Math.round(this.uncertainty * 100) / 100,
      lastSync: this.lastSync,
      endpoint: this._activeEndpoint,
    };
  }

  _setStatus(status) {
    this.status = status;
    this.dispatchEvent(new CustomEvent("statuschange", { detail: { status } }));
  }
}
