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
    const dismissOutside = (event) => {
      if (panel.hidden) return;
      // The dropdown's page-rendered menu lives outside the diagnostics panel.
      const dropdown = container.querySelector('[role="combobox"]');
      const menuId = dropdown?.getAttribute("aria-controls");
      const menu = menuId ? document.getElementById(menuId) : null;
      const path = event.composedPath();
      if (!path.includes(container) && !path.includes(menu)) {
        setOpen(false);
      }
    };
    // A tap on non-interactive text can end without a click on mobile WebKit.
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("click", dismissOutside);
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

    document.fonts.ready.then(() => {
      this._fontsReady = true;
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
      // Give the browser a chance to paint the tick before laying out diagnostics.
      setTimeout(() => this._updateSyncStatus(), 0);
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
      this.els.timezone.textContent =
        tzAbbr.replace(/^GMT/, "UTC") === utcOffset
          ? utcOffset
          : `${tzAbbr} (${utcOffset})`;
    }

    if (this.els.date) {
      this.els.date.textContent = dateStr;
    }
  }

  _updateSyncStatus() {
    if (!this.els.statusText) return;
    const info = this.sync.getStatus();
    const panelOpen = !document.getElementById("sync-tooltip").hidden;
    const metrics = panelOpen ? this.scheduler.getMetrics() : null;
    const copy = describeClock(info, metrics);
    const set = (id, value) => {
      const element = document.getElementById(id);
      if (!element || element.textContent === value) return false;
      element.textContent = value;
      return true;
    };
    const headlineChanged = this._statusHeadline !== copy.headline;
    if (headlineChanged) {
      this._statusHeadline = copy.headline;
      const measurement = copy.headline.match(/^(\d+(?:\.\d+)?) (ms|s)( .+)$/);
      if (measurement) {
        const unit = document.createElement("span");
        unit.className = "status-unit";
        unit.textContent = measurement[2];
        this.els.statusText.replaceChildren(
          measurement[1],
          unit,
          measurement[3],
        );
      } else {
        set("sync-text", copy.headline);
      }
    }
    const sourceChanged = set(
      "sync-source",
      info.status === "syncing"
        ? "Computer clock · checking"
        : "Computer clock",
    );
    const offsetChanged = set(
      "sync-offset",
      info.hasReference
        ? copy.fresh
          ? "Corrected time displayed."
          : info.status === "syncing"
            ? "Verifying the previous reference"
            : "Recheck needed."
        : "Uncorrected device time",
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
    if (this._fontsReady && (headlineChanged || sourceChanged || offsetChanged))
      this._resizeSyncPill();
    if (!panelOpen) return;
    set("diagnostic-summary", copy.summary);
    set("diagnostic-action", copy.action);
    set("diagnostic-correction", copy.correction);
    set("diagnostic-watch", copy.watch);
    set("diagnostic-issue", info.issue);
    set(
      "diagnostic-range",
      info.hasReference
        ? `±${duration(info.networkUncertainty)}${info.sampleAge > info.age ? " from the tighter previous measurement, confirmed by the latest check" : " at the latest check"}`
        : "Not measured",
    );
    set(
      "diagnostic-age",
      info.age === null
        ? "No successful check yet"
        : copy.fresh
          ? `${Math.floor(info.age / 1000)} seconds ago`
          : "Previous reference awaiting verification",
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
      copy.fresh
        ? `±${duration(info.uncertainty)} including measured transfer ranges and drift allowance`
        : "Awaiting a fresh measurement",
    );
    set("diagnostic-rtt", duration(info.rtt));
    set("diagnostic-jitter", duration(info.jitter));
    set(
      "diagnostic-offset",
      copy.fresh
        ? `±${Math.ceil(info.offsetUncertainty)} ms including the reference range, device clock resolution, and time to read the clock`
        : "Awaiting a fresh measurement",
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
  }

  /**
   * Pretext: dynamically size sync pill width so text never overlaps the watch SVG.
   * Measures all visible text lines, finds the widest, sets min-width accordingly.
   */
  _resizeSyncPill() {
    const syncBtn = document.getElementById("sync-btn");
    if (!syncBtn || !this.els.statusText) return;

    let maxWidth = 0;
    for (const el of [
      this.els.statusText,
      this.els.statusSource,
      this.els.statusOffset,
    ]) {
      const style = getComputedStyle(el);
      if (!style.font || !el.textContent) continue;
      const headline = el === this.els.statusText;
      const text = headline ? el.textContent.toUpperCase() : el.textContent;
      const prepared = prepareWithSegments(text, style.font);
      walkLineRanges(prepared, Infinity, (line) => {
        const tracking = (parseFloat(style.letterSpacing) || 0) * text.length;
        maxWidth = Math.max(
          maxWidth,
          line.width + tracking + (headline ? 18 : 0),
        );
      });
    }

    // Only the text column is measured. The grid reserves its own artwork column.
    syncBtn.style.setProperty("--status-width", `${Math.ceil(maxWidth)}px`);
  }
}
