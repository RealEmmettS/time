// Copyright QubeTX — tikset.com

/** Wake before a corrected boundary, then use the first eligible animation frame. */
export class SecondScheduler {
  constructor({
    now,
    render,
    visible = () => document.visibilityState === "visible",
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    frame = requestAnimationFrame,
    cancelFrame = cancelAnimationFrame,
    monotonic = () => performance.now(),
  }) {
    Object.assign(this, {
      now,
      render,
      visible,
      setTimer,
      clearTimer,
      frame,
      cancelFrame,
      monotonic,
    });
    this.running = false;
    this.timer = null;
    this.raf = null;
    this.lateness = [];
    this.cadence = [];
  }
  start() {
    this.running = true;
    this.refresh();
  }
  stop() {
    this.running = false;
    this._cancel();
  }
  _cancel() {
    if (this.timer !== null) this.clearTimer(this.timer);
    if (this.raf !== null) this.cancelFrame(this.raf);
    this.timer = this.raf = null;
  }
  refresh() {
    this._cancel();
    const current = this.now();
    this.render(current);
    if (this.running) this._schedule(current);
  }
  _schedule(current) {
    const boundary = (Math.floor(current / 1000) + 1) * 1000;
    const foreground = this.visible();
    this.timer = this.setTimer(
      () => {
        this.timer = null;
        if (this.visible()) this._frame(boundary, null);
        else this.refresh();
      },
      Math.max(0, boundary - this.now() - (foreground ? 50 : 0)),
    );
  }
  _frame(boundary, previous) {
    this.raf = this.frame(() => {
      this.raf = null;
      const mono = this.monotonic();
      if (previous !== null) this._record(this.cadence, mono - previous);
      const current = this.now();
      if (current >= boundary) {
        this._record(this.lateness, current - boundary);
        this.render(current);
        if (this.running) this._schedule(current);
      } else if (this.running) this._frame(boundary, mono);
    });
  }
  _record(values, value) {
    values.push(value);
    if (values.length > 120) values.shift();
  }
  getMetrics() {
    const summarize = (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted.length
        ? {
            count: sorted.length,
            median: sorted[Math.floor(sorted.length / 2)],
            p95: sorted[
              Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
            ],
            max: sorted.at(-1),
          }
        : null;
    };
    return {
      callbackLateness: summarize(this.lateness),
      frameCadence: summarize(this.cadence),
    };
  }
}
