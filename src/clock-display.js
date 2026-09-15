// Copyright QubeTX — tikset.com

/**
 * Clock display — renders atomic-corrected time to the DOM.
 * Renders on corrected second boundaries and keeps diagnostics separate from time transfer.
 */

import {
  formatTime,
  formatDateString,
  getTimezoneAbbr,
  getUtcOffsetString,
} from "./timezone.js";
import { SecondScheduler } from "./second-scheduler.js";
import { describeClock, duration } from "./diagnostics.js";
import { mountClockHelp } from "./clock-help.js";
import { prepareWithSegments, walkLineRanges } from "@chenglou/pretext";

export class ClockDisplay {
  constructor(atomicSync) {
    this.sync = atomicSync;
    this.use24Hour = false;
    this.scheduler = new SecondScheduler({
      now: () => this.sync.nowMs(),
      render: (value) => this._tick(value),
    });
    this._lastRenderedSecond = -1;
    this._lastRenderedMinute = -1;
    this._rafId = null;
    this._fontsReady = false;

    // DOM references (set in mount)
    this.els = {};
  }

  mount() {
    this.els = {
      hours: document.getElementById("clock-hours"),
      minutes: document.getElementById("clock-minutes"),
      seconds: document.getElementById("clock-seconds"),
      ampm: document.getElementById("clock-ampm"),
      timezone: document.getElementById("clock-timezone"),
      date: document.getElementById("clock-date"),
      statusDot: document.getElementById("sync-dot"),
      statusText: document.getElementById("sync-text"),
      statusSource: document.getElementById("sync-source"),
      statusRtt: document.getElementById("sync-rtt"),
      statusOffset: document.getElementById("sync-offset"),
      statusTooltip: document.getElementById("sync-tooltip-text"),
      toggle: document.getElementById("toggle-24"),
    };

    mountClockHelp(document, navigator);

    // 12/24 toggle
    if (this.els.toggle) {
      this.els.toggle.addEventListener("change", () => {
        this.use24Hour = this.els.toggle.checked;
        localStorage.setItem("use24Hour", this.use24Hour);
        this._forceUpdate();
      });
    }

    // Load saved preference
    const saved = localStorage.getItem("use24Hour");
    if (saved === "true") {
      this.use24Hour = true;
      if (this.els.toggle) this.els.toggle.checked = true;
    }

    // Listen for sync status changes
    this.sync.addEventListener("statuschange", (e) => {
      this._updateSyncStatus();
      this.scheduler.refresh();
    });

    const syncBtn = document.getElementById("sync-btn");
    const panel = document.getElementById("sync-tooltip");
    const container = document.getElementById("sync-container");
    const setOpen = (open) => {
      panel.hidden = !open;
      syncBtn.setAttribute("aria-expanded", String(open));
      if (open) this._updateSyncStatus();
    };
    syncBtn.addEventListener("click", () => setOpen(panel.hidden));
    document.addEventListener("click", (event) => {
      if (!container.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !panel.hidden) {
        setOpen(false);
        syncBtn.focus();
      }
    });
    document.getElementById("sync-recheck").addEventListener("click", () => {
      this.sync.sync({ crossCheck: true });
    });
    this._updateSyncStatus();

    // Pretext: RAF-gated resize listener (no ResizeObserver)
    const scheduleResize = () => {
      if (this._rafId !== null) return;
      this._rafId = requestAnimationFrame(() => {
        this._rafId = null;
        if (this._fontsReady) {
          this._resizeClockDigits();
          this._resizeSyncPill();
        }
      });
    };
    window.addEventListener("resize", scheduleResize);

    // Pretext: gate on font readiness before first measurement
    document.fonts.ready.then(() => {
      this._fontsReady = true;
      this._resizeClockDigits();
      this._resizeSyncPill();
    });

    this.start();
  }

  start() {
    this.scheduler.start();
  }

  stop() {
    this.scheduler.stop();
  }

  _tick(nowMs = this.sync.nowMs()) {
    const now = new Date(nowMs);
    const currentSecond = Math.floor(nowMs / 1000);
    if (currentSecond !== this._lastRenderedSecond) {
      this._lastRenderedSecond = currentSecond;
      this._renderTime(now);
      const currentMinute = Math.floor(nowMs / 60_000);
      if (currentMinute !== this._lastRenderedMinute) {
        this._lastRenderedMinute = currentMinute;
        this._renderMeta(now);
      }
      this._updateSyncStatus();
    }
  }

  _forceUpdate() {
    this._lastRenderedSecond = -1;
    this._lastRenderedMinute = -1;
    this._tick();
  }

  _renderTime(date) {
    const { hours, minutes, seconds, ampm } = formatTime(date, this.use24Hour);

    if (this.els.hours) this.els.hours.textContent = hours;
    if (this.els.minutes) this.els.minutes.textContent = minutes;
    if (this.els.seconds) this.els.seconds.textContent = seconds;

    if (this.els.ampm) {
      if (this.use24Hour) {
        this.els.ampm.style.display = "none";
      } else {
        this.els.ampm.style.display = "";
        this.els.ampm.textContent = ampm;
      }
    }

    // Update browser tab title with corrected time
    const timeStr = this.use24Hour
      ? `${hours}:${minutes}:${seconds}`
      : `${hours}:${minutes}:${seconds} ${ampm}`;
    document.title = `${timeStr} \u2014 ATOMIC TIME`;
  }

  _renderMeta(date) {
    const tzAbbr = getTimezoneAbbr(date);
    const utcOffset = getUtcOffsetString(date);
    const dateStr = formatDateString(date);

    if (this.els.timezone) {
      this.els.timezone.textContent = `${tzAbbr} (${utcOffset})`;
    }

    if (this.els.date) {
      this.els.date.textContent = dateStr;
    }
  }

  _updateSyncStatus() {
    if (!this.els.statusText) return;
    const info = this.sync.getStatus();
    const copy = describeClock(info);
    const set = (id, value) => {
      const element = document.getElementById(id);
      if (element && element.textContent !== value) element.textContent = value;
    };
    const headlineChanged = this.els.statusText.textContent !== copy.headline;
    set("sync-text", copy.headline);
    set(
      "sync-source",
      info.status === "syncing"
        ? "Computer clock · checking"
        : "Computer clock · details",
    );
    set(
      "sync-rtt",
      info.hasReference
        ? `Estimated range ±${duration(info.uncertainty)}`
        : "Waiting for a time reference",
    );
    set(
      "sync-offset",
      info.hasReference
        ? copy.fresh
          ? "Corrected time below"
          : "Previous reference · recheck needed"
        : "Uncorrected device time below",
    );
    this.els.statusDot.classList.remove(
      "bg-green-500",
      "bg-yellow-500",
      "bg-red-500",
    );
    this.els.statusDot.classList.add(
      info.status === "conflict" || info.status === "error"
        ? "bg-red-500"
        : copy.fresh && info.status !== "syncing"
          ? "bg-green-500"
          : "bg-yellow-500",
    );
    set(
      "clock-reference-label",
      info.hasReference
        ? copy.fresh
          ? "NETWORK-CORRECTED TIME"
          : "PREVIOUS TIME REFERENCE · CHECK NEEDED"
        : "DEVICE TIME · NOT YET CHECKED",
    );
    set("diagnostic-summary", copy.summary);
    set("diagnostic-correction", copy.correction);
    set("diagnostic-watch", copy.watch);
    set("diagnostic-issue", info.issue);
    set(
      "diagnostic-range",
      info.hasReference
        ? `±${duration(info.networkUncertainty)} at the last measurement`
        : "Not measured",
    );
    set(
      "diagnostic-age",
      info.age === null
        ? "No successful check yet"
        : `${Math.floor(info.age / 1000)} seconds ago`,
    );
    set("diagnostic-agreement", copy.agreement);
    set("diagnostic-source", info.endpoint?.name || "None");
    set(
      "diagnostic-upstream",
      info.upstream
        ? `${info.upstream.name} · ±${duration(info.upstreamUncertainty)} upstream range, including NTP path and reported root uncertainty`
        : "No measured upstream range is available for this source.",
    );
    set(
      "diagnostic-total",
      info.hasReference
        ? `±${duration(info.uncertainty)} including measured transfer ranges and drift allowance`
        : "Not measured",
    );
    set("diagnostic-rtt", duration(info.rtt));
    set("diagnostic-jitter", duration(info.jitter));
    set(
      "diagnostic-offset",
      info.hasReference
        ? `${duration(Math.abs(info.offset))} ${info.offset >= 0 ? "behind" : "ahead"}; range ±${duration(info.offsetUncertainty)}`
        : "Not measured",
    );
    set(
      "diagnostic-samples",
      info.hasReference
        ? `${info.samplesUsed} of ${info.samplesTotal} accepted; ${info.samplesRejected} rejected`
        : "Not measured",
    );
    set(
      "diagnostic-drift",
      info.hasReference
        ? `${duration(info.driftAllowance)} since measurement (100 ppm allowance, plus any applied correction). ${info.drift?.active ? `Measured rate correction ${(info.drift.rate * 1e6).toFixed(1)} ppm; historical model, not hardware calibration.` : `No rate correction: no validated drift model yet (${info.drift?.samples || 0} measurements).`}`
        : "Not measured",
    );
    set(
      "diagnostic-resolution",
      `Timing floor ${duration(info.resolution)}; device clock floor ${duration(info.wallResolution)}`,
    );
    set(
      "diagnostic-checks",
      info.checks
        .map(
          (check) =>
            `${check.endpoint.name}: ${check.error ? "unavailable or inconsistent" : `±${duration(check.uncertainty)}, checked ${Math.floor(Math.max(0, this.sync.monotonic() - check.measuredAt) / 1000)} s ago`}${info.rejectedSources?.includes(check.endpoint.name) ? " — excluded by majority agreement" : ""}${check.endpoint.observeOnly ? " — leap-smearing service; never used to set this clock" : ""}`,
        )
        .join(" · ") || "Not checked yet",
    );
    const metrics = this.scheduler.getMetrics();
    set(
      "diagnostic-render",
      metrics.callbackLateness
        ? `${duration(metrics.callbackLateness.median)} median / ${duration(metrics.callbackLateness.p95)} p95 callback lateness`
        : "Collecting visible ticks",
    );
    set(
      "diagnostic-frames",
      metrics.frameCadence
        ? `${duration(metrics.frameCadence.median)} median between sampled frames`
        : "Collecting frames",
    );
    document.getElementById("sync-recheck").disabled =
      info.status === "syncing";
    if (headlineChanged && this._fontsReady) this._resizeSyncPill();
  }

  /**
   * Pretext: dynamically size sync pill width so text never overlaps the watch SVG.
   * Measures all visible text lines, finds the widest, sets min-width accordingly.
   */
  _resizeSyncPill() {
    const syncBtn = document.getElementById("sync-btn");
    if (!syncBtn || !this.els.statusText) return;

    const font = getComputedStyle(this.els.statusText).font;
    if (!font) return;

    const texts = [
      this.els.statusText?.textContent,
      this.els.statusSource?.textContent,
      this.els.statusRtt?.textContent,
      this.els.statusOffset?.textContent,
    ].filter(Boolean);

    let maxWidth = 0;
    for (const t of texts) {
      const prepared = prepareWithSegments(t, font);
      walkLineRanges(prepared, Infinity, (line) => {
        if (line.width > maxWidth) maxWidth = line.width;
      });
    }

    // dot(10) + dot-gap(8) + text + right padding for SVG(48) + button padding(24)
    const totalWidth = Math.ceil(maxWidth + 10 + 8 + 48 + 24);
    syncBtn.style.width = `${Math.min(totalWidth, window.innerWidth - 32)}px`;
  }

  /**
   * Pretext: dynamically size clock digits to fill available width.
   * Measures reference clock text, scales font-size proportionally.
   * More padding on large screens, less on small screens.
   */
  _resizeClockDigits() {
    const clockContainer = document.querySelector(".clock-container");
    const main = document.querySelector("main");
    if (!clockContainer || !main) return;

    const timeEls = clockContainer.querySelectorAll(".clock-time");
    const colonEls = clockContainer.querySelectorAll(".clock-colon");
    if (!timeEls.length) return;

    // Get the clock font family
    const computed = getComputedStyle(timeEls[0]);
    const fontFamily = computed.fontFamily;
    const fontWeight = computed.fontWeight;

    const viewportWidth = window.innerWidth;
    const isStacked = viewportWidth < 430;

    // Responsive padding: more on large screens, less on small
    let sidePadding;
    if (viewportWidth >= 1440) {
      sidePadding = viewportWidth * 0.12; // 12% each side on TV/large
    } else if (viewportWidth >= 768) {
      sidePadding = viewportWidth * 0.06; // 6% each side on desktop
    } else {
      sidePadding = 24; // 24px fixed on mobile
    }
    const availableWidth = viewportWidth - sidePadding * 2;

    // Measure at a reference size
    const refSize = 100;
    const refFont = `${fontWeight} ${refSize}px ${fontFamily}`;

    // Measure the widest possible clock string
    const measureText = isStacked ? "00:00" : "00:00:00";
    const prepared = prepareWithSegments(measureText, refFont);
    let measuredWidth = 0;
    walkLineRanges(prepared, Infinity, (line) => {
      if (line.width > measuredWidth) measuredWidth = line.width;
    });

    if (measuredWidth === 0) return;

    // Scale font size to fill available width
    let targetSize = (refSize * availableWidth) / measuredWidth;

    // Cap at max size
    const maxSize = viewportWidth >= 1440 ? 352 : 288;
    targetSize = Math.min(targetSize, maxSize);

    // Apply to clock-time elements
    const targetPx = `${Math.floor(targetSize)}px`;
    timeEls.forEach((el) => {
      el.style.fontSize = targetPx;
    });

    // Colons at ~75% of digit size
    const colonSize = `${Math.floor(targetSize * 0.75)}px`;
    colonEls.forEach((el) => {
      el.style.fontSize = colonSize;
    });
  }
}
