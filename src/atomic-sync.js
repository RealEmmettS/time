// Copyright QubeTX — tikset.com

import {
  CROSS_CHECK_MS,
  DRIFT_MS_PER_MS,
  FRESH_MS,
  fuseIntervals,
  utcStamp,
  timestampReceipt,
  timerResolution,
  refineResolution,
  timingSample,
} from "./timing.js";

import { selectSources, validatedBurst } from "./source-selection.js";
import { DriftTracker } from "./drift-tracker.js";

const CHECK_TIMEOUT_MS = 45_000;

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
    utc: (data) => data.utc_datetime,
  },
  {
    name: "timeapi.io",
    url: "https://timeapi.io/api/time/current/zone?timeZone=UTC",
    utc: (data) => data.dateTime?.replace(/Z$/, "") + "Z",
  },
];

// Cancel fetches as well as the caller's wait. A suspended body reader or
// timer may settle much later than its owner.
async function withDeadline(ms, parent, run) {
  parent?.throwIfAborted();
  const controller = new AbortController();
  const { signal } = controller;
  const cancel = () => controller.abort(parent.reason);
  parent?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException("Time check timed out", "TimeoutError"),
      ),
    ms,
  );
  let onAbort;
  const stopped = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([stopped, run(signal)]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    parent?.removeEventListener("abort", cancel);
  }
}

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
    this._probeMonotonic = resolution === undefined && this.resolution === 100;
    this._probeWall =
      wallResolution === undefined && this.wallResolution === 100;
    this.reference = null;
    this._previousBurst = null;
    this._deviceBaseline = null;
    this.repeatedMinimum = 0;
    this.drift = new DriftTracker();
    this.rejectedSources = [];
    this.status = "idle";
    this.issue = "";
    this.checks = [];
    this.agreement = "unchecked";
    this._lastCrossCheck = -Infinity;
    this._controller = null;
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
    const controller = new AbortController();
    this._controller = controller;
    const deadline = this.monotonic() + CHECK_TIMEOUT_MS;
    this._inFlight = withDeadline(
      CHECK_TIMEOUT_MS,
      controller.signal,
      (signal) => this._synchronize(this._runningCrossCheck, signal, deadline),
    )
      .catch((error) => {
        if (controller.signal.aborted) return;
        this._resetDrift();
        this.checks = [];
        this.rejectedSources = [];
        this.agreement = "unchecked";
        this.issue =
          error.name === "TimeoutError"
            ? "The time check timed out. You can check again now."
            : "The time check was interrupted. You can check again now.";
        this._queuedCrossCheck = false;
        this._setStatus(this.reference ? "stale" : "error");
      })
      .finally(() => {
        if (this._controller !== controller) return;
        this._controller = null;
        this._inFlight = null;
        if (this._queuedCrossCheck) {
          this._queuedCrossCheck = false;
          return this.sync({ crossCheck: true });
        }
        this._scheduleRetry();
      });
    this._setStatus("syncing");
    return this._inFlight;
  }

  async _synchronize(crossCheck, signal, deadline) {
    const started = this.monotonic();
    if (this._probeMonotonic) {
      const resolution = await refineResolution(this.monotonic, this.sleep);
      signal.throwIfAborted();
      this.resolution = resolution;
      this._probeMonotonic = false;
    }
    if (this._probeWall) {
      const resolution = await refineResolution(this.wall, this.sleep);
      signal.throwIfAborted();
      this.wallResolution = resolution;
      this._probeWall = false;
    }
    const reports = [];
    const preferred = this.reference?.endpoint;
    const endpoints =
      preferred?.upstream && this.endpoints.includes(preferred)
        ? [
            preferred,
            ...this.endpoints.filter((endpoint) => endpoint !== preferred),
          ]
        : this.endpoints;
    let candidate = null;
    for (const endpoint of endpoints) {
      signal.throwIfAborted();
      // Eight reference samples, two per comparison source. Sequential to avoid contention.
      if (
        candidate &&
        !crossCheck &&
        !(candidate.endpoint.upstream && endpoint.upstream)
      )
        continue;
      try {
        const sample = (scope) =>
          this._syncEndpoint(endpoint, candidate ? 2 : 8, scope);
        const report =
          candidate && !endpoint.protocol
            ? await withDeadline(3500, signal, sample)
            : await sample(signal);
        reports.push(report);
        if (!endpoint.observeOnly) candidate ||= report;
      } catch (error) {
        reports.push({ endpoint, error: error.message });
      }
    }
    signal.throwIfAborted();
    let now = this.monotonic();
    if (crossCheck) {
      this.checks = reports;
      this._lastCrossCheck = now;
    }
    if (!candidate) {
      this._resetDrift();
      this.checks = reports;
      this.agreement = "unchecked";
      this.rejectedSources = [];
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
    let selection = selectSources(comparisons, now, preferred?.name);
    // Refresh the other providers before letting old votes reject a fresh measurement.
    if (!crossCheck && (!selection || selection.rejected.length)) {
      this._runningCrossCheck = true;
      return this._synchronize(true, signal, deadline);
    }
    // A selected cross-check needs a fresh full burst before becoming the reference.
    for (
      let attempts = 0;
      selection && attempts < this.endpoints.length;
      attempts++
    ) {
      const chosen = selection.selected;
      if (reports.includes(chosen) && chosen.samplesTotal === 8) break;
      let refined;
      try {
        refined = await this._syncEndpoint(chosen.endpoint, 8, signal);
      } catch (error) {
        refined = { endpoint: chosen.endpoint, error: error.message };
      }
      signal.throwIfAborted();
      reports.push(refined);
      comparisons = comparisons.map((r) =>
        r.endpoint.name === chosen.endpoint.name ? refined : r,
      );
      now = this.monotonic();
      selection = selectSources(comparisons, now, preferred?.name);
    }
    signal.throwIfAborted();
    // A browser can delay the timeout task itself while the tab is hidden.
    if (now >= deadline)
      throw new DOMException("Time check timed out", "TimeoutError");
    this.checks = comparisons;
    if (
      !selection ||
      !reports.includes(selection.selected) ||
      selection.selected.samplesTotal !== 8
    ) {
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
    const corroborated =
      this.agreement === "agree" && !selection.rejected.length;
    const supported =
      corroborated &&
      selection.members.filter(
        (source) => source.upstream && now - source.measuredAt < FRESH_MS,
      ).length >= 2;
    const basis = supported
      ? validatedBurst(candidate, this._previousBurst, selection.members, now)
      : candidate;
    this._previousBurst = supported ? candidate : null;
    const driftModel = this.drift.add({
      at: candidate.measuredAt,
      offset: candidate.offset,
      uncertainty: candidate.uncertainty,
      source: candidate.endpoint.name,
      supported,
    });
    const initialCorrection = (now - basis.measuredAt) * driftModel.rate;
    this.reference = {
      ...basis,
      verifiedAt: candidate.measuredAt,
      correctionAllowance: Math.abs(initialCorrection),
      epoch: basis.offset + now + initialCorrection,
      anchor: now,
      rate: driftModel.rate,
      duration: now - started,
    };
    this._recordDeviceCheck(this.getStatus().corroboratedMinimum, now);
    this.issue = "";
    this._setStatus("synced");
    return this.getStatus();
  }

  async _syncEndpoint(endpoint, count, signal) {
    // Drain the warm-up body so the connection is reusable.
    try {
      await this._sample(endpoint, signal);
    } catch {
      /* Real samples decide availability. */
    }
    const samples = [];
    let failed = 0;
    for (let i = 0; i < count; i++) {
      signal?.throwIfAborted();
      try {
        samples.push(await this._sample(endpoint, signal));
      } catch {
        signal?.throwIfAborted();
        failed++;
        if (failed >= 2 && samples.length === 0) break;
      }
      if (
        i < count - 1 &&
        (typeof document === "undefined" || !document.hidden)
      )
        await this.sleep(50);
    }
    const measuredAt = this.monotonic();
    const aged = samples.map((s) => {
      const drift = Math.max(0, measuredAt - s.received) * DRIFT_MS_PER_MS;
      return { ...s, lower: s.lower - drift, upper: s.upper + drift };
    });
    const fused = fuseIntervals(aged);
    if (!fused || fused.samplesUsed <= count / 2)
      throw new Error("Insufficient or conflicting samples");
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

  _sample(endpoint, parent) {
    return withDeadline(3000, parent, (signal) =>
      this._fetchSample(endpoint, signal),
    );
  }

  async _fetchSample(endpoint, signal) {
    const requestId = `t${++this._sequence}-${Math.random().toString(36).slice(2)}`;
    const url = `${endpoint.url}${endpoint.url.includes("?") ? "&" : "?"}requestId=${requestId}`;
    const sent = this.monotonic();
    const response = await this.fetcher(url, {
      cache: "no-store",
      signal,
    });
    const headersAt = this.monotonic();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (Number(response.headers.get("age")) > 0)
      throw new Error("Cached timestamp");
    const body = await response.text();
    const bodyAt = this.monotonic();
    if (bodyAt - sent > 3000) throw new Error("Late timestamp response");
    let received = bodyAt,
      quantum = 0;
    const data = JSON.parse(body);
    let serverReceived, serverSent;
    if (endpoint.protocol) {
      if (data.version !== 1 || data.requestId !== requestId)
        throw new Error("Unrecognized or replayed timestamp");
      serverReceived = data.receivedAt;
      serverSent = data.sentAt;
      if (data.timestamp !== serverSent)
        throw new Error("Inconsistent timestamp");
      received = timestampReceipt(
        response.headers.get("x-tikset-sent-at"),
        serverSent,
        headersAt,
        bodyAt,
      );
    } else if (endpoint.utc) {
      const stamp = utcStamp(endpoint.utc(data));
      serverReceived = serverSent = stamp.time;
      quantum = stamp.quantum;
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
    const sample = timingSample({
      sent,
      received,
      serverReceived,
      serverSent,
      resolution: this.resolution,
    });
    return {
      ...sample,
      lower: sample.lower - quantum,
      upper: sample.upper + quantum,
      // Both rounding and truncation are possible for public timestamps.
      quantum,
      upstream: endpoint.upstream ? data.source : null,
    };
  }

  nowMs(mono = this.monotonic()) {
    return this.reference
      ? this.reference.epoch +
          (mono - this.reference.anchor) +
          this._driftCorrection(mono)
      : this.wall();
  }
  _driftCorrection(mono = this.monotonic()) {
    return this.reference
      ? Math.min(
          Math.max(
            0,
            FRESH_MS - (this.reference.anchor - this.reference.measuredAt),
          ),
          Math.max(0, mono - this.reference.anchor),
        ) * (this.reference.rate || 0)
      : 0;
  }
  now() {
    return new Date(this.nowMs());
  }

  _readClocks() {
    // The wall read occurred somewhere between the two monotonic timestamps.
    const before = this.monotonic();
    const wall = this.wall();
    const mono = this.monotonic();
    const halfWindow = Math.max(0, mono - before) / 2;
    return { mono, wall, midpoint: before + halfWindow, halfWindow };
  }

  _recordDeviceCheck(minimum, mono) {
    // Only new network evidence counts toward a repeated device diagnosis.
    const previous = this._deviceBaseline;
    if (!minimum) {
      this._deviceBaseline = null;
      this.repeatedMinimum = 0;
      return;
    }
    if (
      !previous ||
      Math.sign(minimum) !== Math.sign(previous.minimum) ||
      mono - previous.at > 180_000
    ) {
      this.repeatedMinimum = 0;
    } else if (mono - previous.at < 45_000) {
      previous.minimum =
        Math.sign(minimum) *
        Math.min(Math.abs(minimum), Math.abs(previous.minimum));
      this.repeatedMinimum =
        Math.sign(minimum) *
        Math.min(Math.abs(minimum), Math.abs(this.repeatedMinimum));
      return;
    } else {
      this.repeatedMinimum =
        Math.sign(minimum) *
        Math.min(Math.abs(previous.minimum), Math.abs(minimum));
    }
    this._deviceBaseline = { at: mono, minimum };
  }

  getStatus() {
    const { mono, wall, midpoint, halfWindow } = this._readClocks();
    const age = this.reference
      ? Math.max(0, mono - this.reference.verifiedAt)
      : null;
    const sampleAge = this.reference
      ? Math.max(0, mono - this.reference.measuredAt)
      : null;
    const driftAllowance = this.reference
      ? sampleAge * DRIFT_MS_PER_MS +
        this.reference.correctionAllowance +
        Math.abs(this._driftCorrection(mono))
      : null;
    const uncertainty = this.reference
      ? this.reference.uncertainty + driftAllowance
      : null;
    const status =
      this.status === "synced" && age > FRESH_MS ? "stale" : this.status;
    const recentChecks = this.checks.filter(
      (r) =>
        !r.error &&
        !r.endpoint.observeOnly &&
        !this.rejectedSources.includes(r.endpoint.name) &&
        mono - r.measuredAt < CROSS_CHECK_MS,
    );
    const ntpChecks = recentChecks.filter(
      (r) => r.upstream && mono - r.measuredAt <= FRESH_MS,
    );
    const ntpOffsets = ntpChecks.map((r) => r.offset);
    let corroboratedMinimum = 0;
    if (
      this.agreement === "agree" &&
      !this.rejectedSources.length &&
      ntpChecks.length >= 2
    ) {
      // The closest value to zero supported in the same direction by every
      // NTP range, including device read error. A wide peer cannot justify a sync.
      let lower = Infinity,
        upper = -Infinity;
      for (const check of ntpChecks) {
        const offset = check.offset + midpoint - wall;
        const radius =
          check.uncertainty +
          (mono - check.measuredAt) * DRIFT_MS_PER_MS +
          this.wallResolution +
          halfWindow;
        lower = Math.min(lower, offset - radius);
        upper = Math.max(upper, offset + radius);
      }
      corroboratedMinimum = lower > 0 ? lower : Math.min(0, upper);
    }
    return {
      status,
      hasReference: !!this.reference,
      offset: this.reference ? this.nowMs(midpoint) - wall : null,
      uncertainty,
      offsetUncertainty:
        uncertainty === null
          ? null
          : uncertainty + this.wallResolution + halfWindow,
      networkUncertainty: this.reference?.networkUncertainty ?? null,
      upstreamUncertainty: this.reference?.upstreamUncertainty ?? null,
      upstream: this.reference?.upstream ?? null,
      driftAllowance,
      sampleAge,
      repeatedMinimum: this.repeatedMinimum,
      corroboratedMinimum,
      agreeingNtp: ntpOffsets.length,
      ntpSpread:
        ntpOffsets.length >= 2
          ? Math.max(...ntpOffsets) - Math.min(...ntpOffsets)
          : null,
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
    this._previousBurst = null;
    this._deviceBaseline = null;
    this.repeatedMinimum = 0;
    if (this.reference) {
      const correction = this._driftCorrection();
      this.reference.epoch += correction;
      this.reference.correctionAllowance += Math.abs(correction);
      this.reference.rate = 0;
    }
  }

  invalidate(reason) {
    this._resetDrift();
    this._controller?.abort();
    this._controller = null;
    this._inFlight = null;
    this._queuedCrossCheck = false;
    this._clearRetry();
    this._retryUsed = false;
    this._probe = { mono: this.monotonic(), wall: this.wall() };
    this.issue = reason;
    this._lastCrossCheck = -Infinity;
    this.agreement = "unchecked";
    this.checks = [];
    this.rejectedSources = [];
    this._setStatus(this.reference ? "stale" : "idle");
  }

  _clearRetry() {
    clearTimeout(this._retryTimer);
    this._retryTimer = null;
  }

  _scheduleRetry() {
    if (this.status === "synced") {
      this._retryUsed = false;
      this._clearRetry();
      return;
    }
    if (
      this._timer === null ||
      this._retryUsed ||
      !this._canSync() ||
      (typeof document !== "undefined" && document.hidden)
    )
      return;
    this._retryUsed = true;
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      if (
        this._canSync() &&
        (typeof document === "undefined" || !document.hidden)
      )
        this.sync({ crossCheck: true });
    }, 10_000);
  }

  startAutoSync(intervalMs = 60_000, canSync = () => true) {
    this.stopAutoSync();
    this._canSync = canSync;
    this._timer = setInterval(() => {
      if (canSync()) this.sync();
    }, intervalMs);
    if (canSync()) this.sync({ crossCheck: true });
  }
  stopAutoSync() {
    this._clearRetry();
    this._retryUsed = false;
    if (this._timer !== null) clearInterval(this._timer);
    this._timer = null;
  }
  _setStatus(status) {
    this.status = status;
    this.dispatchEvent(new CustomEvent("statuschange", { detail: { status } }));
  }
}
