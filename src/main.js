import './style.css';
import { AtomicClockSync } from './atomic-sync.js';
import { ClockDisplay } from './clock-display.js';

const sync = new AtomicClockSync();
const display = new ClockDisplay(sync);

// Mount display once DOM is ready
display.mount();

// Start auto-sync (re-syncs every 10 minutes)
sync.startAutoSync(600_000);

// Re-sync when tab becomes visible again
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // If last sync was more than 2 minutes ago, re-sync immediately
    const elapsed = Date.now() - sync.lastSync;
    if (elapsed > 120_000) {
      sync.sync().catch(() => {});
    }
  }
});
