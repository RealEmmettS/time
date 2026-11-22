// Copyright QubeTX — tikset.com

import "./style.css";
import { AtomicClockSync } from "./atomic-sync.js";
import { ClockDisplay } from "./clock-display.js";

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
