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
        if (this.els.statusDetail) {
          this.els.statusDetail.textContent = `${source} · ${info.rtt}ms RTT · ${info.offset > 0 ? '+' : ''}${info.offset}ms offset`;
        }
        if (this.els.statusTooltip) {
          this.els.statusTooltip.textContent = this._buildTooltip(info, source);
        }
        break;
      }
      case 'error':
        dot.classList.add('bg-red-500');
        text.textContent = 'OFFLINE';
        if (this.els.statusDetail) {
          this.els.statusDetail.textContent = 'Using device clock';
        }
        if (this.els.statusTooltip) {
          this.els.statusTooltip.textContent =
            'Could not reach the time server. The clock is showing your device\'s built-in time, which may be off by a second or more. It will try to reconnect automatically.';
        }
        break;
      default:
        dot.classList.add('bg-yellow-500');
        text.textContent = 'WAITING';
        if (this.els.statusTooltip) {
          this.els.statusTooltip.textContent = 'Connecting to the atomic clock server to get the exact time...';
        }
    }
  }

  _buildTooltip(info, source) {
    const lines = [];
    const absOffset = Math.abs(info.offset);
    const rtt = info.rtt;
    const halfRtt = Math.round(rtt / 2);
    const sign = info.offset > 0 ? '+' : '';
    const direction = info.offset > 0 ? 'behind' : 'ahead of';

    // ── Source explanation ──
    if (source === 'PTB Atomic Clock') {
      lines.push('SOURCE: PTB (Physikalisch-Technische Bundesanstalt), Germany. Their caesium fountain clock is accurate to within one second per 100 million years. This clock pulls time directly from that source over HTTPS.');
    } else {
      lines.push('SOURCE: NTP time server synchronized to atomic clock standards via the Network Time Protocol. The server keeps its clock within milliseconds of international atomic time (UTC).');
    }

    lines.push('');

    // ── RTT explanation (15 tiers) ──
    lines.push('ROUND-TRIP TIME (RTT):');
    if (rtt < 15) {
      lines.push(`${rtt}ms — Exceptional. The signal reached the atomic clock server and returned in under 15ms. You\'re likely on a very fast wired connection near the server. Maximum possible error from network delay: ±${halfRtt}ms. This is near the physical limit of accuracy over the internet.`);
    } else if (rtt < 30) {
      lines.push(`${rtt}ms — Outstanding. Sub-30ms round trip. This level of speed is typically only seen on fiber connections or when the server is geographically close. Network-induced error: ±${halfRtt}ms at most.`);
    } else if (rtt < 50) {
      lines.push(`${rtt}ms — Excellent. The signal bounced to the time server and back in under 50ms — faster than a blink of an eye (which takes ~150ms). The time shown is extremely close to true atomic time. Network error ceiling: ±${halfRtt}ms.`);
    } else if (rtt < 75) {
      lines.push(`${rtt}ms — Very good. The round-trip completed in under 75ms. This is a typical result for a fast broadband connection. The accuracy ceiling from network delay alone is about ±${halfRtt}ms — well under a tenth of a second.`);
    } else if (rtt < 100) {
      lines.push(`${rtt}ms — Good. Under 100ms round trip. Most home internet connections fall in this range. The time could be off by up to ±${halfRtt}ms from true atomic time, but that's imperceptible when setting a watch.`);
    } else if (rtt < 150) {
      lines.push(`${rtt}ms — Solid. The signal took about ${rtt}ms to travel to the server and back. This is normal for connections crossing a continent. Theoretical accuracy: within ±${halfRtt}ms of atomic time.`);
    } else if (rtt < 200) {
      lines.push(`${rtt}ms — Moderate. About a fifth of a second for the full round trip. You're likely connecting across a large geographic distance or through several network hops. Accuracy is within ±${halfRtt}ms — roughly a tenth of a second.`);
    } else if (rtt < 300) {
      lines.push(`${rtt}ms — Fair. The round trip took about a quarter second. This is common for intercontinental connections (e.g., US to Europe). The displayed time could be off by up to ±${halfRtt}ms, but the seconds display is still reliable.`);
    } else if (rtt < 400) {
      lines.push(`${rtt}ms — Slow. Over 300ms round trip suggests a long network path — possibly satellite relay, congested routing, or a server on another continent. Accuracy: ±${halfRtt}ms. The seconds shown are still corrected, but sub-second precision is limited.`);
    } else if (rtt < 500) {
      lines.push(`${rtt}ms — Sluggish. Nearly half a second for the round trip. The time server is very far away or the network is under heavy load. Accuracy ceiling: ±${halfRtt}ms. The seconds are still useful for watch-setting.`);
    } else if (rtt < 750) {
      lines.push(`${rtt}ms — Poor. Over half a second of network delay. This could be a satellite internet connection, heavy network congestion, or a server experiencing load. Accuracy: ±${halfRtt}ms. Consider retrying on a faster connection for better precision.`);
    } else if (rtt < 1000) {
      lines.push(`${rtt}ms — Very poor. Nearly a full second of round-trip delay. The time is corrected for this delay, but the correction itself has significant uncertainty. Accuracy: roughly ±${halfRtt}ms (about half a second).`);
    } else if (rtt < 2000) {
      lines.push(`${rtt}ms — Extremely slow. Over a full second of delay. This is unusual and suggests severe network issues, satellite internet, or a VPN adding latency. The displayed time is still corrected, but accuracy is limited to ±${halfRtt}ms.`);
    } else if (rtt < 5000) {
      lines.push(`${rtt}ms — Critical. ${(rtt / 1000).toFixed(1)} seconds of round-trip delay. Something is seriously wrong with the network connection. The time shown has been corrected, but it could be off by over a second. Retry on a different network.`);
    } else {
      lines.push(`${rtt}ms — The round trip took ${(rtt / 1000).toFixed(1)} seconds. This connection is effectively unusable for precise time sync. The displayed time is a rough estimate at best. Connect to a faster network and reload.`);
    }

    lines.push('');

    // ── Offset explanation (15 tiers) ──
    lines.push('CLOCK OFFSET:');
    if (absOffset < 2) {
      lines.push(`${sign}${info.offset}ms — Virtually perfect. Your device\'s clock is within 2 milliseconds of atomic time. This is as accurate as any consumer device can possibly be. Your phone or computer\'s time sync is working flawlessly.`);
    } else if (absOffset < 5) {
      lines.push(`${sign}${info.offset}ms — Near-perfect. Your device is only ${absOffset}ms ${direction} atomic time — about the time it takes light to travel 1,000 miles. No watch can measure this difference. Your device\'s time sync is excellent.`);
    } else if (absOffset < 15) {
      lines.push(`${sign}${info.offset}ms — Excellent. ${absOffset}ms ${direction} atomic time. For context, a hummingbird's wing flaps every 12-80ms. This difference is completely invisible in daily life. The time shown matches your device clock almost exactly.`);
    } else if (absOffset < 30) {
      lines.push(`${sign}${info.offset}ms — Very good. ${absOffset}ms ${direction} atomic time. A human can\'t perceive time differences shorter than about 30ms. Your device is accurate enough that you wouldn\'t notice the difference even if the clock weren't corrected.`);
    } else if (absOffset < 50) {
      lines.push(`${sign}${info.offset}ms — Good. ${absOffset}ms ${direction} atomic time. This is about a twentieth of a second — the limit of human visual perception. The corrected time shown here is virtually identical to what your device shows.`);
    } else if (absOffset < 100) {
      lines.push(`${sign}${info.offset}ms — Acceptable. ${absOffset}ms (${(absOffset / 1000).toFixed(2)}s) ${direction} atomic time. Less than a tenth of a second — not enough to matter when setting a watch. This clock corrects for it anyway.`);
    } else if (absOffset < 250) {
      lines.push(`${sign}${info.offset}ms — Noticeable to instruments. Your device is ${(absOffset / 1000).toFixed(2)} seconds ${direction} atomic time. A quarter-second — you might notice it if you compared two clocks side by side. This display shows the corrected atomic time.`);
    } else if (absOffset < 500) {
      lines.push(`${sign}${info.offset}ms — Your device is about half a second ${direction} atomic time. If you compared your phone\'s clock to this one, you\'d see them tick at slightly different moments. What\'s shown here is the corrected time.`);
    } else if (absOffset < 1000) {
      lines.push(`${sign}${info.offset}ms — Your device clock is ${(absOffset / 1000).toFixed(1)} seconds ${direction} atomic time. Under a second — close enough that you\'d only notice if watching both clocks at once. This display is corrected to show true atomic time.`);
    } else if (absOffset < 2000) {
      lines.push(`${sign}${info.offset}ms — Your device clock is ${(absOffset / 1000).toFixed(1)} seconds ${direction} atomic time. About 1-2 seconds off — this is common for consumer devices. If you set a watch to your phone, it\'d be about a second off. This display shows the corrected time.`);
    } else if (absOffset < 5000) {
      lines.push(`${sign}${info.offset}ms — Your device is ${(absOffset / 1000).toFixed(1)} seconds ${direction} atomic time. That's a few seconds — definitely noticeable. Your device\'s automatic time sync may be slow or misconfigured. This clock has been corrected.`);
    } else if (absOffset < 10000) {
      lines.push(`${sign}${info.offset}ms — Your device clock is off by ${(absOffset / 1000).toFixed(1)} seconds. You\'d visibly see your phone and this clock showing different seconds. This display has been adjusted to show true atomic time. Consider checking your device\'s date/time settings.`);
    } else if (absOffset < 30000) {
      lines.push(`${sign}${info.offset}ms — Your device is off by ${(absOffset / 1000).toFixed(0)} seconds (about ${(absOffset / 60000).toFixed(1)} minutes). This is a significant drift. Your device\'s NTP time sync may be broken or disabled. The time shown here has been corrected to atomic time.`);
    } else if (absOffset < 300000) {
      lines.push(`${sign}${info.offset}ms — Your device clock is off by ${(absOffset / 60000).toFixed(1)} minutes. This is a serious time sync problem. Your device may have lost its internet time sync or the setting may be disabled. The time shown here is corrected, but you should fix your device\'s clock settings.`);
    } else {
      lines.push(`${sign}${info.offset}ms — Your device clock is off by ${(absOffset / 3600000).toFixed(1)} hours. Something is very wrong — the timezone might be incorrect, or automatic time has been disabled. This display shows corrected atomic time, but your device needs attention.`);
    }

    lines.push('');

    // ── Watch-setting guidance (12 combined tiers based on RTT + offset) ──
    lines.push('FOR SETTING A WATCH:');
    if (rtt < 30 && absOffset < 15) {
      lines.push('This is laboratory-grade accuracy for a web browser. The time shown is within ~15ms of true atomic time — far more precise than any mechanical or quartz watch can display. Set your second hand to the next tick with complete confidence.');
    } else if (rtt < 50 && absOffset < 30) {
      lines.push('Near-perfect sync. The time is accurate to within a few hundredths of a second. Set your watch to the next second change — you\'re getting time that\'s as good as a dedicated atomic clock receiver.');
    } else if (rtt < 100 && absOffset < 50) {
      lines.push('Excellent accuracy. The time is within a twentieth of a second of atomic time. When the seconds change on screen, your watch should change at the same moment. Any difference is below human perception.');
    } else if (rtt < 100 && absOffset < 200) {
      lines.push('Very good accuracy with a small device offset. The seconds displayed are corrected and reliable. Watch the second tick over and set your watch right on the mark — the error is under a fifth of a second.');
    } else if (rtt < 150 && absOffset < 100) {
      lines.push('Good accuracy. The time is within about a tenth of a second of atomic time. For setting a watch, this is more than precise enough. Align your second hand to the screen and you\'re set.');
    } else if (rtt < 200 && absOffset < 500) {
      lines.push('Solid accuracy. Your device had some clock drift, but this display has been corrected. The seconds shown are reliable — set your watch to match and you\'ll be within half a second of atomic time.');
    } else if (rtt < 300 && absOffset < 1000) {
      lines.push('Reasonable accuracy. The seconds shown are corrected for your device\'s drift. When setting a watch, wait for the second to tick over and set yours to match — you\'ll be within about a second of atomic time.');
    } else if (rtt < 300 && absOffset < 2000) {
      lines.push('The seconds are corrected and reliable for watch-setting, despite your device being a couple seconds off. Align your watch to the second change on screen — the display is corrected to atomic time.');
    } else if (rtt < 500 && absOffset < 5000) {
      lines.push('The time has been corrected for both network delay and your device\'s significant clock drift. The seconds shown should be close to atomic time. Set your watch to the second change, but know there\'s a small margin of error from the slow network connection.');
    } else if (rtt < 500) {
      lines.push('The time is corrected but the combination of network delay and device clock drift means the accuracy is limited. For rough watch-setting, the seconds display is still your best bet — just know it could be off by up to a second.');
    } else if (rtt < 1000) {
      lines.push('The network connection is slow, which limits how precisely we can sync. The seconds shown are a best-effort correction. For watch-setting, use the minute change as your reference point — it\'s more reliable than trying to nail the exact second.');
    } else {
      lines.push('The network delay is very high, making precise sync difficult. The minutes shown are reliable, but individual seconds may be off by a second or more. For accurate watch-setting, try again on a faster internet connection.');
    }

    return lines.join('\n');
  }
}
