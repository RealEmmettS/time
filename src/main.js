// Copyright QubeTX — tikset.com

import "./style.css";
import { AtomicClockSync } from "./atomic-sync.js";
import { ClockDisplay } from "./clock-display.js";
import {
  isTimezoneConfident,
  resolveTimezoneFromLocation,
} from "./timezone.js";

const sync = new AtomicClockSync();
const display = new ClockDisplay(sync);

display.mount();

// Start auto-sync (re-syncs every 10 minutes, matching time.gov)
sync.startAutoSync(600_000);

// Re-sync when tab becomes visible again (handles sleep/background)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    const elapsed = Date.now() - sync.lastSync;
    if (elapsed > 120_000) {
      sync.sync().catch(() => {});
    }
  }
});

// Timezone confidence check — only request location if Intl API gives weak results.
// On 99.9% of modern browsers, the Intl API returns a correct IANA timezone and this never fires.
if (!isTimezoneConfident()) {
  console.log(
    "[Timezone] Low confidence — requesting location to resolve timezone...",
  );
  resolveTimezoneFromLocation().then((tz) => {
    if (tz) {
      console.log(`[Timezone] Resolved: ${tz}`);
      // Force a re-render to pick up the new timezone display
      display._forceUpdate();
    } else {
      console.log(
        "[Timezone] Could not resolve from location. Using UTC offset fallback.",
      );
    }
  });
} else {
  console.log(`[Timezone] Confident detection (no location needed)`);
}
