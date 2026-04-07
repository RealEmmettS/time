// Copyright QubeTX — tikset.com

/**
 * Clock display — renders atomic-corrected time to the DOM.
 * Uses setInterval at 20ms (same approach as time.gov) for reliable second ticking.
 */

import {
  formatTime,
  formatDateString,
  getTimezoneAbbr,
  getUtcOffsetString,
} from "./timezone.js";
import {
  classify,
  computeWatchScore,
  RTT_THRESHOLDS,
  RTT_TIERS,
  OFFSET_THRESHOLDS,
  OFFSET_TIERS,
  WATCH_THRESHOLDS,
  WATCH_TIERS,
} from "./tier-data.js";
import { prepareWithSegments, walkLineRanges } from "@chenglou/pretext";

export class ClockDisplay {
  constructor(atomicSync) {
    this.sync = atomicSync;
    this.use24Hour = false;
    this._intervalId = null;
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
      this._updateSyncStatus(e.detail.status);
    });

    // Tooltip: tap to toggle on mobile, hover with 1.5s close delay on desktop
    const syncBtn = document.getElementById("sync-btn");
    const syncTooltip = document.getElementById("sync-tooltip");
    const syncContainer = document.getElementById("sync-container");
    this._hoverTimeout = null;

    const showTooltip = () => {
      if (this._hoverTimeout) {
        clearTimeout(this._hoverTimeout);
        this._hoverTimeout = null;
      }
      syncTooltip.classList.add("sync-tooltip-visible");
      syncTooltip.classList.remove("sync-tooltip-hidden");
      syncBtn.setAttribute("aria-expanded", "true");
    };

    const hideTooltip = () => {
      syncTooltip.classList.remove("sync-tooltip-visible");
      syncTooltip.classList.add("sync-tooltip-hidden");
      syncBtn.setAttribute("aria-expanded", "false");
    };

    const hideTooltipDelayed = () => {
      if (this._hoverTimeout) clearTimeout(this._hoverTimeout);
      this._hoverTimeout = setTimeout(hideTooltip, 1500);
    };

    if (syncBtn && syncTooltip && syncContainer) {
      // Desktop: hover with 1.5s delay on leave (covers both pill and tooltip)
      syncContainer.addEventListener("mouseenter", showTooltip);
      syncContainer.addEventListener("mouseleave", hideTooltipDelayed);

      // Keep tooltip open while hovering/scrolling the tooltip itself
      syncTooltip.addEventListener("mouseenter", () => {
        if (this._hoverTimeout) {
          clearTimeout(this._hoverTimeout);
          this._hoverTimeout = null;
        }
      });
      syncTooltip.addEventListener("mouseleave", hideTooltipDelayed);

      // Mobile: tap to toggle
      syncBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isVisible = syncTooltip.classList.contains(
          "sync-tooltip-visible",
        );
        if (isVisible) {
          hideTooltip();
        } else {
          showTooltip();
        }
      });

      // Close tooltip when tapping anywhere else on the page
      document.addEventListener("click", (e) => {
        if (!syncContainer.contains(e.target)) {
          hideTooltip();
        }
      });
    }

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
    // Render immediately
    this._tick();
    // Check for second changes every 20ms (same as time.gov)
    this._intervalId = setInterval(() => this._tick(), 20);
  }

  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  _tick() {
    const nowMs = this.sync.nowMs();
    const now = new Date(nowMs);
    const currentSecond = now.getSeconds();

    // Only update DOM when the second changes
    if (currentSecond !== this._lastRenderedSecond) {
      this._lastRenderedSecond = currentSecond;
      this._renderTime(now);

      // Update date/timezone less frequently (once per minute)
      const currentMinute = now.getMinutes();
      if (currentMinute !== this._lastRenderedMinute) {
        this._lastRenderedMinute = currentMinute;
        this._renderMeta(now);
      }
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

  _updateSyncStatus(status) {
    if (!this.els.statusDot || !this.els.statusText) return;

    const dot = this.els.statusDot;
    const text = this.els.statusText;

    // Remove all state classes
    dot.classList.remove("bg-green-500", "bg-yellow-500", "bg-red-500");

    switch (status) {
      case "syncing":
        dot.classList.add("bg-yellow-500");
        text.textContent = "SYNCING";
        break;
      case "synced": {
        dot.classList.add("bg-green-500");
        text.textContent = "SYNCED";
        const info = this.sync.getStatus();
        const source = info.endpoint?.label || "Time Server";
        if (this.els.statusSource) this.els.statusSource.textContent = source;
        if (this.els.statusRtt)
          this.els.statusRtt.textContent = `${info.rtt}ms RTT`;
        if (this.els.statusOffset)
          this.els.statusOffset.textContent = `${info.offset > 0 ? "+" : ""}${info.offset}ms offset`;
        if (this.els.statusTooltip) {
          this.els.statusTooltip.innerHTML = this._buildTooltip(info);
        }
        break;
      }
      case "error":
        dot.classList.add("bg-red-500");
        text.textContent = "OFFLINE";
        if (this.els.statusSource)
          this.els.statusSource.textContent = "Using device clock";
        if (this.els.statusRtt) this.els.statusRtt.textContent = "";
        if (this.els.statusOffset) this.els.statusOffset.textContent = "";
        if (this.els.statusTooltip) {
          this.els.statusTooltip.innerHTML =
            '<div class="mb-2"><div class="font-bold uppercase tracking-wider text-[10px] mb-1">Status</div><p class="leading-relaxed">Could not reach the time server. The clock is showing your device\'s built-in time, which may be off by a second or more. It will try to reconnect automatically.</p></div>';
        }
        break;
      default:
        dot.classList.add("bg-yellow-500");
        text.textContent = "WAITING";
        if (this.els.statusTooltip) {
          this.els.statusTooltip.innerHTML =
            '<div><div class="font-bold uppercase tracking-wider text-[10px] mb-1">Status</div><p class="leading-relaxed">Connecting to the atomic clock server to get the exact time...</p></div>';
        }
    }

    // Re-measure sync pill width after text changes
    if (this._fontsReady) this._resizeSyncPill();
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
    syncBtn.style.minWidth = `${totalWidth}px`;
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

  /**
   * Two-tier conflict resolution for description selection.
   * Tier 1 (hard): same analogy tag → must swap to alt.
   * Tier 2 (soft): same domain → prefer alt if different domain available.
   */
  _resolveDescription(tier, usedAnalogies, usedDomains) {
    const hasHardConflict = (tier.analogies || []).some((a) =>
      usedAnalogies.has(a),
    );
    const hasSoftConflict = usedDomains.has(tier.domain);

    // Hard conflict: MUST swap if alt exists
    if (hasHardConflict && tier.alt) {
      (tier.alt.analogies || []).forEach((a) => usedAnalogies.add(a));
      usedDomains.add(tier.alt.domain || tier.domain);
      return tier.alt.description;
    }

    // Soft conflict: PREFER swap if alt exists and alt's domain is different
    if (hasSoftConflict && tier.alt && !usedDomains.has(tier.alt.domain)) {
      (tier.alt.analogies || []).forEach((a) => usedAnalogies.add(a));
      usedDomains.add(tier.alt.domain);
      return tier.alt.description;
    }

    // No conflict: use primary
    (tier.analogies || []).forEach((a) => usedAnalogies.add(a));
    usedDomains.add(tier.domain);
    return tier.description;
  }

  _buildTooltip(info) {
    const rtt = info.rtt;
    const halfRtt = Math.round(rtt / 2);
    const absOffset = Math.abs(info.offset);
    const sign = info.offset > 0 ? "+" : "";
    const direction = info.offset > 0 ? "behind" : "ahead of";
    const endpointName = info.endpoint?.name || "unknown";
    const endpointLabel = info.endpoint?.label || "Time Server";

    // Classify each axis via binary search
    const rttCtx = { rtt, halfRtt };
    const offsetCtx = { offset: info.offset, absOffset, sign, direction };
    // Use Marzullo uncertainty when available (tighter than RTT/2)
    const marzulloUncertainty =
      info.uncertainty > 0 ? info.uncertainty : halfRtt;
    const uncertainty = marzulloUncertainty + absOffset;
    const watchCtx = {
      rtt,
      halfRtt,
      offset: info.offset,
      absOffset,
      uncertainty,
    };

    const rttTier = classify(RTT_THRESHOLDS, RTT_TIERS, rtt);
    const offsetTier = classify(OFFSET_THRESHOLDS, OFFSET_TIERS, absOffset);
    const watchTier = classify(WATCH_THRESHOLDS, WATCH_TIERS, uncertainty);

    // Track used analogies/domains for conflict resolution (RTT wins priority)
    const usedAnalogies = new Set(rttTier.analogies || []);
    const usedDomains = new Set([rttTier.domain]);

    // Resolve offset and watch descriptions with conflict avoidance
    const offsetDesc = this._resolveDescription(
      offsetTier,
      usedAnalogies,
      usedDomains,
    );
    const watchDesc = this._resolveDescription(
      watchTier,
      usedAnalogies,
      usedDomains,
    );

    // Source section — describes the active endpoint
    const sourceDescriptions = {
      "Vercel Edge":
        "This clock synced with a self-hosted edge server running on Vercel's global network, NTP-synced to within 1\u20132ms of UTC via Stratum 2\u20133 atomic clock infrastructure. Same-origin request for lowest possible latency.",
      "time.now":
        "This clock synced with the time.now atomic time API, which provides continuously synchronized UTC time with microsecond precision via a global CDN.",
      "timeapi.io":
        "This clock synced with an NTP time server (timeapi.io) that tracks international atomic time (UTC) to within milliseconds.",
    };
    const sourceHtml =
      (sourceDescriptions[endpointName] ||
        "This clock synced with a time server that tracks UTC.") +
      " The readings below are the raw measurements from that sync. The time shown on screen has already been corrected using these measurements.";

    // Marzullo uncertainty display (if available)
    const uncertaintyHtml =
      info.uncertainty > 0
        ? ` Marzullo interval fusion across multiple samples narrowed the uncertainty to \u00b1${Math.round(info.uncertainty * 100) / 100}ms.`
        : "";

    return `
      <div class="mb-3">
        <div class="font-bold uppercase tracking-wider text-[10px] mb-1">Source</div>
        <p class="leading-relaxed">${sourceHtml}</p>
        <p class="mt-1 text-[10px] opacity-60 uppercase tracking-wider">Active: ${endpointLabel}</p>
      </div>
      <div class="mb-3">
        <div class="font-bold uppercase tracking-wider text-[10px] mb-1">Round-Trip Time</div>
        <p class="leading-relaxed"><strong>${rttTier.label}.</strong> ${rttTier.description(rttCtx)}${uncertaintyHtml}</p>
        <p class="mt-1"><a href="https://speedqx.com" target="_blank" rel="noopener noreferrer" class="underline opacity-60 hover:opacity-100 text-[10px] uppercase tracking-wider">Test your connection speed \u2192</a></p>
      </div>
      <div class="mb-3">
        <div class="font-bold uppercase tracking-wider text-[10px] mb-1">Clock Offset</div>
        <p class="leading-relaxed"><strong>${offsetTier.label}.</strong> ${offsetDesc(offsetCtx)}</p>
      </div>
      <div>
        <div class="font-bold uppercase tracking-wider text-[10px] mb-1">For Setting a Watch</div>
        <p class="leading-relaxed"><strong>${watchTier.label}.</strong> ${watchDesc(watchCtx)}</p>
      </div>
    `.trim();
  }
}
