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

sync.startAutoSync();

const resume = () => {
  sync.invalidate("Returning to the clock. Checking the time reference again.");
  sync.sync({ crossCheck: true });
  display.scheduler.refresh();
};
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") resume();
  else display.scheduler.refresh();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) resume();
});
window.addEventListener("online", resume);
window.addEventListener("offline", () => {
  sync.invalidate(
    "Connection lost. The previous reference continues if available.",
  );
});
setInterval(() => {
  if (document.visibilityState === "visible") sync.checkContinuity();
}, 1000);

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
