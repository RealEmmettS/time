// Copyright QubeTX — tikset.com
import { DRIFT_MS_PER_MS, fuseIntervals } from "./timing.js";

/** One vote per provider. The agreement region selects a source, never shrinks its error. */
export function selectSources(reports, now) {
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
  const aged = sources.map((source) => {
    const radius =
      source.uncertainty +
      Math.max(0, now - source.measuredAt) * DRIFT_MS_PER_MS;
    return {
      ...source,
      lower: source.offset - radius,
      upper: source.offset + radius,
      resolution: 1,
    };
  });
  const region = fuseIntervals(aged);
  if (!region) return null;
  const members = sources.filter(
    (_, i) => aged[i].lower <= region.offset && aged[i].upper >= region.offset,
  );
  // Prefer Cloudflare; otherwise require a meaningful improvement to change priority.
  const selected =
    members.find((s) => s.endpoint.name === "Cloudflare via Vercel") ??
    members.reduce((best, source) =>
      source.uncertainty +
        Math.max(0, now - source.measuredAt) * DRIFT_MS_PER_MS <
      0.8 *
        (best.uncertainty +
          Math.max(0, now - best.measuredAt) * DRIFT_MS_PER_MS)
        ? source
        : best,
    );
  return {
    selected,
    members,
    rejected: sources.filter((s) => !members.includes(s)),
  };
}
