// Copyright QubeTX — tikset.com

// Oscillator allowance, not a calibrated hardware error bound.
export const DRIFT_MS_PER_MS = 100 / 1_000_000;
export const FRESH_MS = 90_000;
export const CROSS_CHECK_MS = 600_000;

export function parseUtc(value) {
  if (typeof value !== "string") return NaN;
  const match = value.match(
    /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(?:Z|\+00:00)$/,
  );
  if (!match) return NaN;
  return Date.parse(`${match[1]}Z`) + Number(`0.${match[2] || "0"}`) * 1000;
}

/** Offset is server epoch minus the client's monotonic clock. */
export function timingSample({
  sent,
  received,
  serverReceived,
  serverSent,
  resolution = 1,
}) {
  if (
    ![sent, received, serverReceived, serverSent, resolution].every(
      Number.isFinite,
    ) ||
    resolution <= 0
  )
    throw new Error("Invalid timing values");
  const rtt = received - sent;
  const processing = serverSent - serverReceived;
  if (
    rtt < 0 ||
    rtt > 3000 ||
    processing < 0 ||
    processing > rtt + 2 * resolution
  )
    throw new Error("Inconsistent timing values");
  const delay = Math.max(0, rtt - processing);
  const offset = (serverReceived - sent + (serverSent - received)) / 2;
  // Nonnegative path delays imply these bounds; allow for timestamp quantization.
  const radius = delay / 2 + 2 * resolution;
  return {
    offset,
    lower: offset - radius,
    upper: offset + radius,
    rtt,
    delay,
    processing,
    received,
    resolution,
  };
}

/** Unique strict-majority intersection. Points where intervals touch count. */
export function fuseIntervals(samples) {
  if (samples.length < 2) return null;
  const points = [...new Set(samples.flatMap((s) => [s.lower, s.upper]))].sort(
    (a, b) => a - b,
  );
  let maximum = 0;
  let regions = [];
  const consider = (lower, upper, count) => {
    if (count > maximum) {
      maximum = count;
      regions = [];
    }
    if (count !== maximum) return;
    const previous = regions.at(-1);
    if (previous && previous.upper === lower) previous.upper = upper;
    else regions.push({ lower, upper });
  };
  points.forEach((point, index) => {
    consider(
      point,
      point,
      samples.filter((s) => s.lower <= point && s.upper >= point).length,
    );
    const next = points[index + 1];
    if (next !== undefined)
      consider(
        point,
        next,
        samples.filter((s) => s.lower <= point && s.upper >= next).length,
      );
  });
  if (maximum <= samples.length / 2 || regions.length !== 1) return null;
  const { lower, upper } = regions[0];
  const offset = (lower + upper) / 2;
  const members = samples.filter((s) => s.lower <= offset && s.upper >= offset);
  const floor = Math.max(...members.map((s) => 2 * (s.resolution || 1)));
  const uncertainty = Math.max((upper - lower) / 2, floor);
  return {
    offset,
    uncertainty,
    lower: offset - uncertainty,
    upper: offset + uncertainty,
    samplesUsed: members.length,
    samplesRejected: samples.length - members.length,
  };
}

export function intervalsAgree(a, b, now) {
  const allowance =
    (Math.max(0, now - a.measuredAt) + Math.max(0, now - b.measuredAt)) *
    DRIFT_MS_PER_MS;
  return (
    Math.abs(a.offset - b.offset) <= a.uncertainty + b.uncertainty + allowance
  );
}

// Brief probe; if a privacy-coarsened timer never advances, use a 100 ms floor.
export function timerResolution(read, budget = 20_000) {
  let previous = read();
  let minimum = Infinity;
  for (let i = 0; i < budget; i++) {
    const current = read();
    if (current > previous) minimum = Math.min(minimum, current - previous);
    previous = current;
    if (minimum < 1) break;
  }
  return Number.isFinite(minimum) ? Math.max(1, minimum) : 100;
}
