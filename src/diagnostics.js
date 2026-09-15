// Copyright QubeTX — tikset.com

export function duration(ms) {
  if (!Number.isFinite(ms)) return "Not measured";
  return Math.abs(ms) >= 1000
    ? `${(ms / 1000).toFixed(1)} s`
    : `${Math.round(ms)} ms`;
}

export function describeClock(info) {
  const fresh =
    info.hasReference &&
    info.age <= 90_000 &&
    !["stale", "conflict", "error"].includes(info.status) &&
    !info.issue;
  const zero =
    info.hasReference && Math.abs(info.offset) <= info.offsetUncertainty;
  const direction = info.offset > 0 ? "behind" : "ahead";
  const difference = `${duration(Math.abs(info.offset))} ${direction}`;
  const qualified =
    info.agreement !== "agree"
      ? ` Relative to ${info.endpoint?.name || "the selected source"}.`
      : "";
  let summary = info.hasReference
    ? zero
      ? "No clock difference detected within measurement uncertainty."
      : `Your computer clock appears ${difference}.`
    : "Your computer clock has not been checked yet.";
  if (info.hasReference) summary += qualified;
  if (!fresh && info.hasReference)
    summary =
      "The last reference needs to be checked again. The current computer-clock difference is provisional.";
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
              ? "No difference detected"
              : difference,
    summary,
    correction: info.hasReference
      ? "The large clock includes this correction. Your computer’s settings have not changed."
      : "The large clock is showing your device time. Your computer’s settings have not changed.",
    watch: !fresh
      ? "Wait for a fresh, consistent check before setting a watch."
      : info.uncertainty > 100
        ? "The measured timing range is wide. Check again on a stable connection before setting a watch."
        : "Use the large clock’s second change to set your watch. Network uncertainty, browser scheduling, and screen refresh all affect the visible tick.",
    agreement:
      info.agreement === "agree"
        ? info.rejectedSources?.length
          ? `A majority agrees within its measured ranges. Excluded: ${info.rejectedSources.join(", ")}. Agreement does not prove UTC accuracy.`
          : "Checked sources agree within their measured ranges. Agreement is a cross-check, not proof of UTC accuracy."
        : info.agreement === "disagree"
          ? "Sources disagree; the previous reference is retained if available."
          : "Only one source is available or the cross-check has expired. The result is relative to that source.",
  };
}
