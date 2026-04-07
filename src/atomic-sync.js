/**
 * AtomicClockSync — Synchronizes browser clock with atomic time via HTTPS APIs.
 *
 * Uses multi-sample minimum-RTT selection (same algorithm as time.gov / NTP).
 * Primary: iTime.live (PTB atomic clocks, Germany)
 * Fallback: timeapi.io (NTP-synced server)
 *
 * Achievable accuracy: ~30-50ms depending on network conditions.
 */

const ENDPOINTS = {
  primary: {
    url: "https://itime.live/api/time",
    parseTimestamp: (data) => data.timestamp, // ms since epoch
  },
  fallback: {
    url: "https://timeapi.io/api/time/current/zone?timeZone=UTC",
    parseTimestamp: (data) => new Date(data.dateTime + "Z").getTime(),
  },
};

export class AtomicClockSync extends EventTarget {
  constructor() {
    super();
    this.offset = 0;
    this.lastSync = 0;
    this.lastRtt = 0;
    this.status = "idle"; // idle | syncing | synced | error
    this._timer = null;
    this._endpoint = ENDPOINTS.primary;
  }

  /**
   * Perform a multi-sample sync, selecting the minimum-RTT sample.
   * @param {number} samples — Number of requests to make
   * @returns {Promise<{offset: number, rtt: number, confidence: string}>}
   */
  async sync(samples = 5) {
    this._setStatus("syncing");
    const results = [];

    // Try each endpoint in order
    const endpoints = [ENDPOINTS.primary, ENDPOINTS.fallback];

    for (const endpoint of endpoints) {
      this._endpoint = endpoint;
      results.length = 0;

      for (let i = 0; i < samples; i++) {
        try {
          const result = await this._sample();
          results.push(result);
        } catch (e) {
          console.warn(
            `Sync sample ${i + 1} failed (${endpoint.url}):`,
            e.message,
          );
          // If first sample fails, this endpoint is likely down — try next
          if (i === 0) break;
        }

        // Small delay between samples to avoid rate limiting
        if (i < samples - 1) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      // If we got results from this endpoint, use them
      if (results.length > 0) break;

      console.warn(`Endpoint ${endpoint.url} failed, trying next...`);
    }

    if (results.length === 0) {
      this._setStatus("error");
      throw new Error("All sync samples failed");
    }

    // Select minimum-RTT sample (least affected by network jitter)
    results.sort((a, b) => a.rtt - b.rtt);
    const best = results[0];

    this.offset = best.offset;
    this.lastRtt = best.rtt;
    this.lastSync = Date.now();

    // Confidence assessment based on RTT
    let confidence;
    if (best.rtt < 100) confidence = "high";
    else if (best.rtt < 300) confidence = "medium";
    else if (best.rtt < 500) confidence = "fair";
    else confidence = "low";

    this._setStatus("synced");

    const syncResult = {
      offset: Math.round(best.offset * 100) / 100,
      rtt: Math.round(best.rtt * 100) / 100,
      samplesUsed: results.length,
      confidence,
      endpoint: this._endpoint.url,
    };

    console.log(
      `[AtomicSync] Synced: offset=${syncResult.offset}ms, RTT=${syncResult.rtt}ms, confidence=${confidence}, endpoint=${this._endpoint.url}`,
    );

    return syncResult;
  }

  async _sample() {
    const t1 = performance.now();
    const localBefore = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const bustUrl = `${this._endpoint.url}${this._endpoint.url.includes("?") ? "&" : "?"}_=${Date.now()}`;
      const response = await fetch(bustUrl, {
        signal: controller.signal,
        cache: "no-store",
      });

      const t2 = performance.now();
      const localAfter = Date.now();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const serverMs = this._endpoint.parseTimestamp(data);

      if (!serverMs || isNaN(serverMs)) {
        throw new Error("Invalid timestamp from server");
      }

      // High-resolution RTT for sample quality ranking
      const rtt = t2 - t1;
      // The server generated serverMs at approximately the midpoint of the round trip.
      // localMidpoint is the client's clock at that same instant.
      // offset = serverTime - clientTime at the same instant.
      const localMidpoint = (localBefore + localAfter) / 2;
      const offset = serverMs - localMidpoint;

      return { offset, rtt };
    } finally {
      clearTimeout(timeout);
    }
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
      lastSync: this.lastSync,
      endpoint: this._endpoint.url,
    };
  }

  _setStatus(status) {
    this.status = status;
    this.dispatchEvent(new CustomEvent("statuschange", { detail: { status } }));
  }
}
