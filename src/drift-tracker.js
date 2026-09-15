// Copyright QubeTX — tikset.com
const MAX_RATE = 100 / 1_000_000;

/** Bounded interval regression; never infer oscillator drift from wall-clock errors. */
export class DriftTracker {
  constructor() {
    this.reset();
  }
  reset() {
    this.samples = [];
    this.model = null;
    this.confirmations = 0;
    this.rate = 0;
  }
  add(sample) {
    const previous = this.samples.at(-1);
    if (
      !sample.supported ||
      (previous &&
        (sample.source !== previous.source ||
          sample.at < previous.at ||
          sample.at - previous.at > 180_000))
    )
      this.reset();
    if (!sample.supported) return this.status();
    const last = this.samples.at(-1);
    if (last && sample.at - last.at < 45_000) return this.status();
    if (this.model && last) {
      const predicted = last.offset + this.model.rate * (sample.at - last.at);
      const residual = Math.abs(sample.offset - predicted);
      const baseline = Math.abs(sample.offset - last.offset);
      this.confirmations =
        residual < baseline && residual <= sample.uncertainty + last.uncertainty
          ? this.confirmations + 1
          : 0;
    }
    this.samples.push(sample);
    if (this.samples.length > 32) this.samples.shift();
    this.rate = 0;
    this.model = null;
    const span = sample.at - this.samples[0].at;
    if (this.samples.length < 12 || span < 660_000) return this.status();
    let lower = -MAX_RATE,
      upper = MAX_RATE;
    for (let i = 0; i < this.samples.length; i++) {
      for (let j = i + 1; j < this.samples.length; j++) {
        const a = this.samples[i],
          b = this.samples[j];
        const dt = b.at - a.at,
          difference = b.offset - a.offset;
        const uncertainty = a.uncertainty + b.uncertainty;
        lower = Math.max(lower, (difference - uncertainty) / dt);
        upper = Math.min(upper, (difference + uncertainty) / dt);
      }
    }
    // No feasible stable rate, or zero remains plausible: do not change clock speed.
    if (lower > upper || (lower <= 0 && upper >= 0)) {
      this.confirmations = 0;
      return this.status();
    }
    this.model = { rate: (lower + upper) / 2 };
    if (this.confirmations >= 3) this.rate = this.model.rate;
    return this.status();
  }
  status() {
    return {
      rate: this.rate,
      active: this.rate !== 0,
      samples: this.samples.length,
      confirmations: this.confirmations,
    };
  }
}
