// Copyright QubeTX — tikset.com
import { DRIFT_MS_PER_MS, FRESH_MS, fuseIntervals } from "./timing.js";

// A noisy burst can corroborate a recent, more precise measurement. Only
// retain that raw measurement if its entire aged range fits the new one.
export function validatedBurst(current, previous, members, now) {
  if (!previous || previous.endpoint !== current.endpoint) return current;
  const elapsed = now - previous.measuredAt;
  if (elapsed < 0 || elapsed > FRESH_MS) return current;
  const radius = previous.uncertainty + elapsed * DRIFT_MS_PER_MS;
  if (Math.abs(current.offset - previous.offset) + radius > current.uncertainty)
    return current;
  const supported = members.every(
    (source) =>
      Math.abs(source.offset - previous.offset) <=
      source.uncertainty +
        Math.max(0, now - source.measuredAt) * DRIFT_MS_PER_MS,
  );
  return supported ? previous : current;
}

/** One vote per provider. The agreement region selects a source, never shrinks its error. */
export function selectSources(reports, now, preferredName) {
  const unique = new Map();
  for (const report of reports) {
    if (
      !report.error &&
      !report.endpoint.observeOnly &&
      !unique.has(report.endpoint.name)
    )
      unique.set(report.endpoint.name, report);
  }
  const sources = [...unique.values()];
  if (!sources.length) return null;
  if (sources.length === 1)
    return { selected: sources[0], members: sources, rejected: [] };
  const radius = (source) =>
    source.uncertainty + Math.max(0, now - source.measuredAt) * DRIFT_MS_PER_MS;
  const aged = sources.map((source) => ({
    lower: source.offset - radius(source),
    upper: source.offset + radius(source),
    resolution: 1,
  }));
  const region = fuseIntervals(aged);
  if (!region) return null;
  const members = sources.filter(
    (_, i) => aged[i].lower <= region.offset && aged[i].upper >= region.offset,
  );
  // A fallback's transport-only range omits its unknown upstream clock error.
  const measured = members.filter((source) => source.upstream);
  const eligible = measured.length ? measured : members;
  const preferred =
    eligible.find((s) => s.endpoint.name === preferredName) ?? eligible[0];
  const best = eligible.reduce((a, b) => (radius(b) < radius(a) ? b : a));
  const selected = radius(best) <= 0.8 * radius(preferred) ? best : preferred;
  return {
    selected,
    members,
    rejected: sources.filter((s) => !members.includes(s)),
  };
}
