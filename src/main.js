// Copyright QubeTX — tikset.com

import "./style.css";
import { AtomicClockSync } from "./atomic-sync.js";
import { ClockDisplay } from "./clock-display.js";

const sync = new AtomicClockSync();
const display = new ClockDisplay(sync);

display.mount();

let suspended = false;
let needsForegroundCheck = document.hidden;

function returnToClock() {
  if (document.hidden || suspended || !needsForegroundCheck) return;
  needsForegroundCheck = false;
  // A background check can still be in flight, including one started after hiding.
  sync.invalidate("Checking the time after returning to this tab.");
  display.scheduler.resetMetrics();
  display.scheduler.refresh();
  sync.sync({ crossCheck: true });
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    needsForegroundCheck = true;
    sync.invalidate("Waiting for a fresh background measurement.");
    display.scheduler.refresh();
  } else returnToClock();
});
const suspend = () => {
  suspended = true;
  needsForegroundCheck = true;
  sync.invalidate("Timing paused while the page was suspended.");
};
const restore = () => {
  suspended = false;
  returnToClock();
};
document.addEventListener("freeze", suspend);
window.addEventListener("pagehide", suspend);
document.addEventListener("resume", restore);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) restore();
});
window.addEventListener("focus", returnToClock);
window.addEventListener("online", () => {
  if (suspended) return;
  sync.invalidate("Connection restored. Checking the time reference.");
  sync.sync({ crossCheck: true });
});
window.addEventListener("offline", () =>
  sync.invalidate("Connection lost. The clock will retry automatically."),
);
setInterval(() => {
  if (!document.hidden && !needsForegroundCheck && !suspended)
    sync.checkContinuity();
}, 1000);

sync.startAutoSync(60_000, () => !suspended);
