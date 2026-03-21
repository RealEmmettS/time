/**
 * Clock display — renders atomic-corrected time to the DOM.
 * Uses setInterval at 20ms (same approach as time.gov) for reliable second ticking.
 */

import { formatTime, formatDateString, getTimezoneAbbr, getUtcOffsetString } from './timezone.js';
import { classify, computeWatchScore, RTT_THRESHOLDS, RTT_TIERS, OFFSET_THRESHOLDS, OFFSET_TIERS, WATCH_THRESHOLDS, WATCH_TIERS } from './tier-data.js';

export class ClockDisplay {
  constructor(atomicSync) {
    this.sync = atomicSync;
    this.use24Hour = false;
    this._intervalId = null;
    this._lastRenderedSecond = -1;
    this._lastRenderedMinute = -1;

    // DOM references (set in mount)
    this.els = {};
  }

  mount() {
    this.els = {
      hours: document.getElementById('clock-hours'),
      minutes: document.getElementById('clock-minutes'),
      seconds: document.getElementById('clock-seconds'),
      ampm: document.getElementById('clock-ampm'),
      timezone: document.getElementById('clock-timezone'),
      date: document.getElementById('clock-date'),
      statusDot: document.getElementById('sync-dot'),
      statusText: document.getElementById('sync-text'),
      statusSource: document.getElementById('sync-source'),
      statusRtt: document.getElementById('sync-rtt'),
      statusOffset: document.getElementById('sync-offset'),
      statusTooltip: document.getElementById('sync-tooltip-text'),
      toggle: document.getElementById('toggle-24'),
    };

    // 12/24 toggle
    if (this.els.toggle) {
      this.els.toggle.addEventListener('change', () => {
        this.use24Hour = this.els.toggle.checked;
        localStorage.setItem('use24Hour', this.use24Hour);
        this._forceUpdate();
      });
    }

    // Load saved preference
    const saved = localStorage.getItem('use24Hour');
    if (saved === 'true') {
      this.use24Hour = true;
      if (this.els.toggle) this.els.toggle.checked = true;
    }

    // Listen for sync status changes
    this.sync.addEventListener('statuschange', (e) => {
      this._updateSyncStatus(e.detail.status);
    });

    // Tooltip: tap to toggle on mobile, hover handled by CSS for desktop
    const syncBtn = document.getElementById('sync-btn');
    const syncTooltip = document.getElementById('sync-tooltip');
    if (syncBtn && syncTooltip) {
      syncBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = syncTooltip.classList.contains('sync-tooltip-visible');
        syncTooltip.classList.toggle('sync-tooltip-visible', !isVisible);
        syncTooltip.classList.toggle('sync-tooltip-hidden', isVisible);
        syncBtn.setAttribute('aria-expanded', String(!isVisible));
      });

      // Close tooltip when tapping anywhere else on the page
      document.addEventListener('click', () => {
        syncTooltip.classList.remove('sync-tooltip-visible');
        syncTooltip.classList.add('sync-tooltip-hidden');
        syncBtn.setAttribute('aria-expanded', 'false');
      });
    }

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
        this.els.ampm.style.display = 'none';
      } else {
        this.els.ampm.style.display = '';
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
    dot.classList.remove('bg-green-500', 'bg-yellow-500', 'bg-red-500');

    switch (status) {
      case 'syncing':
        dot.classList.add('bg-yellow-500');
        text.textContent = 'SYNCING';
        break;
      case 'synced': {
        dot.classList.add('bg-green-500');
        text.textContent = 'SYNCED';
        const info = this.sync.getStatus();
        const source = info.endpoint.includes('itime') ? 'PTB Atomic Clock' : 'NTP Server';
        if (this.els.statusSource) this.els.statusSource.textContent = source;
        if (this.els.statusRtt) this.els.statusRtt.textContent = `${info.rtt}ms RTT`;
        if (this.els.statusOffset) this.els.statusOffset.textContent = `${info.offset > 0 ? '+' : ''}${info.offset}ms offset`;
        if (this.els.statusTooltip) {
          // Safe: tooltip content is generated from internal tier data, not user input
          this.els.statusTooltip.innerHTML = this._buildTooltip(info, source);
        }
        break;
      }
      case 'error':
        dot.classList.add('bg-red-500');
        text.textContent = 'OFFLINE';
        if (this.els.statusSource) this.els.statusSource.textContent = 'Using device clock';
        if (this.els.statusRtt) this.els.statusRtt.textContent = '';
        if (this.els.statusOffset) this.els.statusOffset.textContent = '';
        if (this.els.statusTooltip) {
          this.els.statusTooltip.innerHTML =
            '<div class="mb-2"><div class="font-bold uppercase tracking-wider text-[10px] mb-1">Status</div><p class="leading-relaxed">Could not reach the time server. The clock is showing your device\'s built-in time, which may be off by a second or more. It will try to reconnect automatically.</p></div>';
        }
        break;
      default:
        dot.classList.add('bg-yellow-500');
        text.textContent = 'WAITING';
        if (this.els.statusTooltip) {
          this.els.statusTooltip.innerHTML =
            '<div><div class="font-bold uppercase tracking-wider text-[10px] mb-1">Status</div><p class="leading-relaxed">Connecting to the atomic clock server to get the exact time...</p></div>';
        }
    }
  }

  /**
   * Two-tier conflict resolution for description selection.
   * Tier 1 (hard): same analogy tag → must swap to alt.
   * Tier 2 (soft): same domain → prefer alt if different domain available.
   */
  _resolveDescription(tier, usedAnalogies, usedDomains) {
    const hasHardConflict = (tier.analogies || []).some(a => usedAnalogies.has(a));
    const hasSoftConflict = usedDomains.has(tier.domain);

    // Hard conflict: MUST swap if alt exists
    if (hasHardConflict && tier.alt) {
      (tier.alt.analogies || []).forEach(a => usedAnalogies.add(a));
      usedDomains.add(tier.alt.domain || tier.domain);
      return tier.alt.description;
    }

    // Soft conflict: PREFER swap if alt exists and alt's domain is different
    if (hasSoftConflict && tier.alt && !usedDomains.has(tier.alt.domain)) {
      (tier.alt.analogies || []).forEach(a => usedAnalogies.add(a));
      usedDomains.add(tier.alt.domain);
      return tier.alt.description;
    }

    // No conflict: use primary
    (tier.analogies || []).forEach(a => usedAnalogies.add(a));
    usedDomains.add(tier.domain);
    return tier.description;
  }

  _buildTooltip(info, source) {
    const rtt = info.rtt;
    const halfRtt = Math.round(rtt / 2);
    const absOffset = Math.abs(info.offset);
    const sign = info.offset > 0 ? '+' : '';
    const direction = info.offset > 0 ? 'behind' : 'ahead of';

    // Classify each axis via binary search
    const rttCtx = { rtt, halfRtt };
    const offsetCtx = { offset: info.offset, absOffset, sign, direction };
    const uncertainty = computeWatchScore(rtt, absOffset);
    const watchCtx = { rtt, halfRtt, offset: info.offset, absOffset, uncertainty };

    const rttTier = classify(RTT_THRESHOLDS, RTT_TIERS, rtt);
    const offsetTier = classify(OFFSET_THRESHOLDS, OFFSET_TIERS, absOffset);
    const watchTier = classify(WATCH_THRESHOLDS, WATCH_TIERS, uncertainty);

    // Track used analogies/domains for conflict resolution (RTT wins priority)
    const usedAnalogies = new Set(rttTier.analogies || []);
    const usedDomains = new Set([rttTier.domain]);

    // Resolve offset and watch descriptions with conflict avoidance
    const offsetDesc = this._resolveDescription(offsetTier, usedAnalogies, usedDomains);
    const watchDesc = this._resolveDescription(watchTier, usedAnalogies, usedDomains);

    // Source section — explains what the readings mean
    let sourceHtml;
    if (source === 'PTB Atomic Clock') {
      sourceHtml = 'This clock synced with the PTB atomic clock in Germany, accurate to one second per 100 million years. The readings below are the raw measurements from that sync. The time shown on screen has already been corrected using these measurements.';
    } else {
      sourceHtml = 'This clock synced with an NTP time server that tracks international atomic time (UTC) to within milliseconds. The readings below are the raw measurements from that sync. The time shown on screen has already been corrected using these measurements.';
    }

    return `
      <div class="mb-3">
        <div class="font-bold uppercase tracking-wider text-[10px] mb-1">Source</div>
        <p class="leading-relaxed">${sourceHtml}</p>
      </div>
      <div class="mb-3">
        <div class="font-bold uppercase tracking-wider text-[10px] mb-1">Round-Trip Time</div>
        <p class="leading-relaxed"><strong>${rttTier.label}.</strong> ${rttTier.description(rttCtx)}</p>
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
