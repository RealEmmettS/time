// Copyright QubeTX — tikset.com

import {
  CROSS_CHECK_MS,
  DRIFT_MS_PER_MS,
  FRESH_MS,
  fuseIntervals,
  parseUtc,
  timerResolution,
  timingSample,
} from "./timing.js";

import { selectSources } from "./source-selection.js";
import { DriftTracker } from "./drift-tracker.js";

export const ENDPOINTS = [
  {
    name: "Cloudflare via Vercel",
    url: "/api/time",
    protocol: true,
    upstream: true,
  },
  {
    name: "NIST via Vercel",
    url: "/api/time?source=nist",
    protocol: true,
    upstream: "time.nist.gov",
  },
  {
    name: "time.now",
    url: "https://time.now/developer/api/timezone/Etc/UTC",
    parse: (data) => parseUtc(data.utc_datetime),
  },
  {
    name: "timeapi.io",
    url: "https://timeapi.io/api/time/current/zone?timeZone=UTC",
    parse: (data) => parseUtc(data.dateTime?.replace(/Z$/, "") + "Z"),
  },
];

export class AtomicClockSync extends EventTarget {
  constructor({
    monotonic = () => performance.now(),
    wall = () => Date.now(),
    fetcher = (...args) => fetch(...args),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    endpoints = ENDPOINTS,
    resolution,
    wallResolution,
  } = {}) {
    super();
    this.monotonic = monotonic;
    this.wall = wall;
    this.fetcher = fetcher;
    this.sleep = sleep;
    this.endpoints = endpoints;
    this.resolution = resolution ?? timerResolution(monotonic);
    this.wallResolution = wallResolution ?? timerResolution(wall);
    this.reference = null;
    this.drift = new DriftTracker();
    this.rejectedSources = [];
    this.status = "idle";
    this.issue = "";
    this.checks = [];
    this.agreement = "unchecked";
    this._lastCrossCheck = -Infinity;
    this._generation = 0;
    this._sequence = 0;
    this._inFlight = null;
    this._timer = null;
    this._probe = { mono: monotonic(), wall: wall() };
  }

  sync({ crossCheck = false } = {}) {
    if (this._inFlight) {
      if (crossCheck && !this._runningCrossCheck) this._queuedCrossCheck = true;
      return this._inFlight;
    }
    this._runningCrossCheck =
      crossCheck ||
      this.monotonic() - this._lastCrossCheck >= CROSS_CHECK_MS ||
      this.agreement === "disagree";
    const generation = this._generation;
    this._setStatus("syncing");
    this._inFlight = this._synchronize(
      this._runningCrossCheck,
      generation,
    ).finally(() => {
      this._inFlight = null;
      if (this._queuedCrossCheck) {
        this._queuedCrossCheck = false;
        return this.sync({ crossCheck: true });
      }
    });
    return this._inFlight;
  }

  async _synchronize(crossCheck, generation) {
    const started = this.monotonic();
    const reports = [];
    let candidate = null;
    for (const endpoint of this.endpoints) {
      if (generation !== this._generation) return;
      // Eight reference samples, two per comparison source. Sequential to avoid contention.
      if (candidate && !crossCheck) break;
      try {
        const report = await this._syncEndpoint(endpoint, candidate ? 2 : 8);
        reports.push(report);
        if (!endpoint.observeOnly) candidate ||= report;
      } catch (error) {
        reports.push({ endpoint, error: error.message });
      }
    }
    if (generation !== this._generation) return;
    let now = this.monotonic();
    if (crossCheck) {
      this.checks = reports;
      this._lastCrossCheck = now;
    }
    if (!candidate) {
      this._resetDrift();
      this.issue = "No consistent time measurement was available.";
      this._setStatus(this.reference ? "stale" : "error");
      return;
    }
    let comparisons = [
      ...reports,
      ...this.checks.filter(
        (r) =>
          !reports.some(
            (current) => current.endpoint.name === r.endpoint.name,
          ) && now - r.measuredAt < CROSS_CHECK_MS,
      ),
    ];
    let selection = selectSources(comparisons, now);
    // Refresh the other providers before letting old votes reject a fresh measurement.
    if (!crossCheck && (!selection || selection.rejected.length)) {
      this._runningCrossCheck = true;
      return this._synchronize(true, generation);
    }
    // A selected cross-check needs eight fresh samples before becoming the reference.
    for (
      let attempts = 0;
      selection && attempts < this.endpoints.length;
      attempts++
    ) {
      const chosen = selection.selected;
      if (reports.includes(chosen) && chosen.samplesTotal === 8) break;
      let refined;
      try {
        refined = await this._syncEndpoint(chosen.endpoint, 8);
      } catch (error) {
        refined = { endpoint: chosen.endpoint, error: error.message };
      }
      if (generation !== this._generation) return;
      reports.push(refined);
      comparisons = comparisons.map((r) =>
        r.endpoint.name === chosen.endpoint.name ? refined : r,
      );
      now = this.monotonic();
      selection = selectSources(comparisons, now);
    }
    if (generation !== this._generation) return;
    this.checks = comparisons;
    if (!selection || selection.selected.samplesTotal !== 8) {
      this._resetDrift();
      this.agreement = "disagree";
      this.rejectedSources = [];
      this.issue =
        "Time sources disagree without a unique majority. Wait for another check before setting a watch.";
      this._setStatus("conflict");
      return;
    }
    candidate = selection.selected;
    this.rejectedSources = selection.rejected.map((r) => r.endpoint.name);
    this.agreement = selection.members.length > 1 ? "agree" : "single";
    const driftModel = this.drift.add({
      at: candidate.measuredAt,
      offset: candidate.offset,
      uncertainty: candidate.uncertainty,
      source: candidate.endpoint.name,
      supported: selection.members.length > 1 && !selection.rejected.length,
    });
    this.reference = {
      ...candidate,
      uncertainty:
        candidate.uncertainty +
        Math.abs((now - candidate.measuredAt) * driftModel.rate),
      epoch:
        candidate.offset + now + (now - candidate.measuredAt) * driftModel.rate,
      anchor: now,
      rate: driftModel.rate,
      duration: now - started,
    };
    this.issue = "";
    this._setStatus("synced");
    return this.getStatus();
  }

  async _syncEndpoint(endpoint, count) {
    // Drain the warm-up body so the connection is reusable.
    try {
      await this._sample(endpoint);
    } catch {
      /* Real samples decide availability. */
    }
    const samples = [];
    let failed = 0;
    for (let i = 0; i < count; i++) {
      try {
        samples.push(await this._sample(endpoint));
      } catch {
        failed++;
        if (failed >= 2 && samples.length === 0) break;
      }
      if (i < count - 1) await this.sleep(50);
    }
    const measuredAt = this.monotonic();
    const aged = samples.map((s) => {
      const drift = Math.max(0, measuredAt - s.received) * DRIFT_MS_PER_MS;
      return { ...s, lower: s.lower - drift, upper: s.upper + drift };
    });
    const fused = fuseIntervals(aged);
    if (!fused) throw new Error("Insufficient or conflicting samples");
    const upstreamUncertainty = Math.max(
      ...samples.map((s) => s.upstream?.uncertaintyMs || 0),
    );
    const networkUncertainty = fused.uncertainty;
    fused.uncertainty += upstreamUncertainty;
    fused.lower -= upstreamUncertainty;
    fused.upper += upstreamUncertainty;
    const offsets = samples.map((s) => s.offset);
    const average =
      offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length;
    return {
      ...fused,
      networkUncertainty,
      upstreamUncertainty,
      upstream: samples.at(-1)?.upstream ?? null,
      endpoint,
      measuredAt,
      rtt: Math.min(...samples.map((s) => s.rtt)),
      jitter: Math.sqrt(
        offsets.reduce((sum, offset) => sum + (offset - average) ** 2, 0) /
          offsets.length,
      ),
      samplesTotal: count,
      samplesRejected: fused.samplesRejected + failed,
    };
  }

  async _sample(endpoint) {
    const requestId = `t${++this._sequence}-${Math.random().toString(36).slice(2)}`;
    const url = `${endpoint.url}${endpoint.url.includes("?") ? "&" : "?"}requestId=${requestId}`;
    const sent = this.monotonic();
    const response = await this.fetcher(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (Number(response.headers.get("age")) > 0)
      throw new Error("Cached timestamp");
    const body = await response.text();
    const received = this.monotonic();
    const data = JSON.parse(body);
    let serverReceived, serverSent;
    if (endpoint.protocol) {
      if (data.version !== 1 || data.requestId !== requestId)
        throw new Error("Unrecognized or replayed timestamp");
      serverReceived = data.receivedAt;
      serverSent = data.sentAt;
      if (data.timestamp !== serverSent)
        throw new Error("Inconsistent timestamp");
    } else {
      serverReceived = serverSent = endpoint.parse(data);
    }
    // The local wall clock may be wrong by days or years; do not validate against it.
    if (
      ![serverReceived, serverSent].every(
        (t) => Number.isFinite(t) && t > 0 && t < 8.64e15,
      )
    )
      throw new Error("Invalid timestamp");
    if (
      endpoint.upstream &&
      (data.source?.name !==
        (typeof endpoint.upstream === "string"
          ? endpoint.upstream
          : "time.cloudflare.com") ||
        data.source?.protocol !== "NTP" ||
        !Number.isFinite(data.source?.uncertaintyMs) ||
        data.source.uncertaintyMs < 0 ||
        data.source.uncertaintyMs > 3000 ||
        !Number.isFinite(data.source?.ageMs) ||
        data.source.ageMs < 0 ||
        data.source.ageMs > 65_000)
    )
      throw new Error("Invalid upstream reference");
    return {
      ...timingSample({
        sent,
        received,
        serverReceived,
        serverSent,
        resolution: this.resolution,
      }),
      upstream: endpoint.upstream ? data.source : null,
    };
  }

  nowMs() {
    return this.reference
      ? this.reference.epoch +
          this.monotonic() -
          this.reference.anchor +
          this._driftCorrection()
      : this.wall();
  }
  _driftCorrection() {
    return this.reference
      ? Math.min(
          FRESH_MS,
          Math.max(0, this.monotonic() - this.reference.anchor),
        ) * (this.reference.rate || 0)
      : 0;
  }
  now() {
    return new Date(this.nowMs());
  }

  getStatus() {
    const mono = this.monotonic();
    const age = this.reference
      ? Math.max(0, mono - this.reference.measuredAt)
      : null;
    const uncertainty = this.reference
      ? this.reference.uncertainty +
        age * DRIFT_MS_PER_MS +
        Math.abs(this._driftCorrection())
      : null;
    const status =
      this.status === "synced" && age > FRESH_MS ? "stale" : this.status;
    const recentChecks = this.checks.filter(
      (r) => !r.error && mono - r.measuredAt < CROSS_CHECK_MS,
    );
    return {
      status,
      hasReference: !!this.reference,
      offset: this.reference ? this.nowMs() - this.wall() : null,
      uncertainty,
      offsetUncertainty:
        uncertainty === null ? null : uncertainty + this.wallResolution,
      networkUncertainty: this.reference?.networkUncertainty ?? null,
      upstreamUncertainty: this.reference?.upstreamUncertainty ?? null,
      upstream: this.reference?.upstream ?? null,
      driftAllowance:
        age === null
          ? null
          : age * DRIFT_MS_PER_MS + Math.abs(this._driftCorrection()),
      drift: this.drift.status(),
      rejectedSources: this.rejectedSources,
      age,
      endpoint: this.reference?.endpoint,
      rtt: this.reference?.rtt,
      jitter: this.reference?.jitter,
      samplesUsed: this.reference?.samplesUsed,
      samplesTotal: this.reference?.samplesTotal,
      samplesRejected: this.reference?.samplesRejected,
      duration: this.reference?.duration,
      resolution: this.resolution,
      wallResolution: this.wallResolution,
      agreement:
        this.agreement === "agree" && recentChecks.length < 2
          ? "single"
          : this.agreement,
      checks: this.checks,
      issue: this.issue,
    };
  }

  checkContinuity() {
    const current = { mono: this.monotonic(), wall: this.wall() };
    const elapsed = current.mono - this._probe.mono;
    const wallElapsed = current.wall - this._probe.wall;
    this._probe = current;
    if (
      elapsed < 0 ||
      elapsed > 5000 ||
      Math.abs(wallElapsed - elapsed) > Math.max(20, 2 * this.wallResolution)
    ) {
      this.invalidate(
        "Clock change or interrupted timing detected. Checking again.",
      );
      this.sync({ crossCheck: true });
      return true;
    }
    return false;
  }

  _resetDrift() {
    this.drift.reset();
    if (this.reference) {
      const correction = this._driftCorrection();
      this.reference.epoch += correction;
      this.reference.uncertainty += Math.abs(correction);
      this.reference.rate = 0;
    }
  }

  invalidate(reason) {
    this._resetDrift();
    this._generation++;
    this.issue = reason;
    this._lastCrossCheck = -Infinity;
    if (this._inFlight) this._queuedCrossCheck = true;
    this._setStatus(this.reference ? "stale" : "idle");
  }

  startAutoSync(intervalMs = 60_000) {
    this.stopAutoSync();
    this.sync({ crossCheck: true });
    this._timer = setInterval(() => {
      if (
        typeof document === "undefined" ||
        document.visibilityState === "visible"
      )
        this.sync();
    }, intervalMs);
  }
  stopAutoSync() {
    if (this._timer !== null) clearInterval(this._timer);
    this._timer = null;
  }
  _setStatus(status) {
    this.status = status;
    this.dispatchEvent(new CustomEvent("statuschange", { detail: { status } }));
  }
}
