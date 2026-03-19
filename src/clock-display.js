/**
 * Clock display — renders atomic-corrected time to the DOM.
 * Uses setInterval at 20ms (same approach as time.gov) for reliable second ticking.
 */

import { formatTime, formatDateString, getTimezoneAbbr, getUtcOffsetString } from './timezone.js';

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
      statusDetail: document.getElementById('sync-detail'),
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
        if (this.els.statusDetail) {
          this.els.statusDetail.textContent = `${info.rtt}ms RTT · ${info.offset > 0 ? '+' : ''}${info.offset}ms offset`;
        }
        break;
      }
      case 'error':
        dot.classList.add('bg-red-500');
        text.textContent = 'OFFLINE';
        if (this.els.statusDetail) {
          this.els.statusDetail.textContent = 'Using device clock';
        }
        break;
      default:
        dot.classList.add('bg-yellow-500');
        text.textContent = 'WAITING';
    }
  }
}
