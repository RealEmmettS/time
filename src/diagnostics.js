// Copyright QubeTX — tikset.com
import { FRESH_MS } from "./timing.js";

export function duration(ms) {
  if (!Number.isFinite(ms)) return "Not measured";
  return Math.abs(ms) >= 1000
    ? `${(ms / 1000).toFixed(1)} s`
    : `${Math.round(ms)} ms`;
}

function deviceDuration(ms, inSeconds = ms >= 1000) {
  if (ms >= 60_000) {
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor(ms / 60_000) % 60;
    const seconds = (ms % 60_000) / 1000;
    return [
      hours && `${hours} h`,
      minutes && `${minutes} min`,
      seconds && `${seconds} s`,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return inSeconds ? `${ms / 1000} s` : `${ms} ms`;
}

// Round both ends outward so the text includes the entire measured interval.
function deviceRange(offset, uncertainty) {
  const low = Math.floor(offset - uncertainty);
  const high = Math.ceil(offset + uncertainty);
  const inSeconds = Math.max(-low, high) >= 1000;
  const format = (ms) => deviceDuration(ms, inSeconds);
  if (low >= 0) return `${format(low)} to ${format(high)} behind`;
  if (high <= 0) return `${format(-high)} to ${format(-low)} ahead`;
  return `${format(-low)} ahead to ${format(high)} behind`;
}

function deviceAdvice(info, fresh) {
  if (!fresh) {
    if (info.status === "syncing")
      return "Wait for the current check to finish.";
    if (info.status === "conflict")
      return "Check again before adjusting the computer. The time sources give conflicting readings.";
    return "Check your connection and run a fresh check before adjusting the computer.";
  }
  if (info.agreeingNtp < 2 || info.rejectedSources.length)
    return "Check again before adjusting the computer. Look for fresh, consistent readings from both Cloudflare and NIST.";
  const magnitude = Math.abs(info.offset);
  const minimum = magnitude - info.offsetUncertainty;
  const maximum = magnitude + info.offsetUncertainty;
  if (maximum <= 100)
    return "The entire measured range is within a tenth of a second. Leave automatic time enabled for everyday use.";
  if (minimum <= 0)
    return "The range is too wide to tell whether the computer needs a correction. Keep this tab visible and check again on a steady connection.";
  const corroborated = Math.min(
    minimum,
    Math.sign(info.offset) * info.corroboratedMinimum,
  );
  if (corroborated >= 1000)
    return "Even the closest end of the measured range is at least one second off. Run your operating system’s automatic time sync now, then select Check again.";
  const repeated = Math.sign(info.offset) * info.repeatedMinimum;
  if (Math.min(corroborated, repeated) >= 100)
    return "Two checks at least 45 seconds apart put the computer at least a tenth of a second off in the same direction. Run your operating system’s automatic time sync, then select Check again to measure the change.";
  if (corroborated >= 100)
    return "Leave this tab visible for the next minute’s check. If it confirms this difference, use your operating system’s automatic time sync.";
  return "The reference ranges still allow an error under a tenth of a second. Keep automatic time enabled and check again in a minute.";
}

function watchAdvice(info, fresh, metrics) {
  if (!fresh)
    return "Wait for a fresh, consistent check before setting a watch.";
  if (!info.upstream || info.agreeingNtp < 2 || info.rejectedSources.length)
    return "For a precise setting, check again until both network time references agree.";
  if (info.uncertainty > 100)
    return "The reference has over 100 ms of timing uncertainty. Check again on a steadier connection before using a tick.";
  const ticks = metrics?.callbackLateness;
  if (ticks?.count >= 5 && ticks.p95 > 100)
    return `Recent second changes ran late (95th percentile ${duration(ticks.p95)}). Keep this tab in the foreground and wait for steadier ticks before setting a watch.`;
  return "Use the change to the next second on the large clock. Screen refresh, display latency, and your reaction time add to the reference uncertainty.";
}

export function describeClock(info, metrics) {
  const fresh =
    info.hasReference &&
    info.age <= FRESH_MS &&
    !["stale", "conflict", "error"].includes(info.status) &&
    !info.issue;
  const zero =
    info.hasReference && Math.abs(info.offset) <= info.offsetUncertainty;
  const direction = info.offset > 0 ? "behind" : "ahead";
  const difference = `${deviceDuration(Math.round(Math.abs(info.offset)))} ${direction}`;
  let summary = "Your computer clock has not been checked yet.";
  if (fresh) {
    const range = deviceRange(info.offset, info.offsetUncertainty);
    summary = zero
      ? `An on-time clock fits this measurement. The range is ${range}.`
      : `Your computer clock appears ${difference}. The range is ${range}.`;
    if (info.agreement !== "agree" || !info.upstream)
      summary += ` Relative to ${info.endpoint.name}.`;
    if (!info.upstream)
      summary += " This source’s upstream clock error is unknown.";
  } else if (info.hasReference) {
    summary =
      "A fresh reference is needed to measure your current computer-clock difference.";
  }
  return {
    fresh,
    headline:
      info.status === "conflict"
        ? "Sources disagree"
        : !info.hasReference
          ? "Device time"
          : !fresh
            ? "Check needed"
            : zero
              ? "Within measurement range"
              : difference,
    summary,
    action: deviceAdvice(info, fresh),
    correction: fresh
      ? "The large clock already uses the network correction."
      : info.hasReference
        ? "The large clock is advancing from the previous reference."
        : "The large clock is showing your device time.",
    watch: watchAdvice(info, fresh, metrics),
    agreement: describeAgreement(info),
  };
}

function describeAgreement(info) {
  if (info.agreement === "disagree")
    return "The measured ranges conflict. A fresh check is needed to resolve the difference.";
  if (!info.hasReference || info.agreement === "unchecked")
    return "Waiting for a usable reference.";
  if (info.agreement !== "agree")
    return "Only the selected source has a current supporting measurement.";
  let text =
    info.agreeingNtp >= 2
      ? `The Cloudflare and NIST estimates were ${info.ntpSpread < 1 ? "under 1 ms" : duration(info.ntpSpread)} apart. Their timing ranges overlap.`
      : "The available sources overlap within their measured ranges.";
  if (info.rejectedSources?.length)
    text += ` The majority excludes ${info.rejectedSources.join(", ")}.`;
  return text;
}
