// Copyright QubeTX — tikset.com

/**
 * Timezone detection and formatting utilities.
 *
 * Timezone detection uses local browser data:
 *   1. Intl.DateTimeFormat API — reads timezone from OS settings (instant, universal)
 *   2. Date.getTimezoneOffset() — fallback for UTC offset (universal)
 *
 * Works on: Chrome, Firefox, Safari, Edge, Samsung Internet, Opera
 * Platforms: Windows, macOS, Linux, iOS, Android, Smart TVs, embedded browsers
 */

/**
 * Detect the user's IANA timezone (e.g., "America/New_York").
 * Falls back to UTC offset-based name if Intl API is unavailable.
 */
export function detectTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== "UTC" && tz.includes("/")) return tz;
    if (tz) return tz;
  } catch {
    // Intl API not available
  }
  const offset = new Date().getTimezoneOffset();
  if (offset === 0) return "Etc/UTC";
  const sign = offset <= 0 ? "+" : "-";
  const hours = Math.floor(Math.abs(offset) / 60);
  return `Etc/GMT${sign}${hours}`;
}

/**
 * Get timezone abbreviation (e.g., "EDT", "PST", "AEST").
 * Handles DST transitions automatically.
 * @param {Date} date
 * @returns {string}
 */
export function getTimezoneAbbr(date) {
  try {
    const tz = detectTimezone();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    if (tzPart && tzPart.value) return tzPart.value;
  } catch {
    // Fall through
  }
  try {
    const match = date.toString().match(/\(([^)]+)\)/);
    if (match) {
      const words = match[1].split(" ");
      if (words.length >= 2) return words.map((w) => w[0]).join("");
      return match[1];
    }
  } catch {
    // Fall through
  }
  return getUtcOffsetString(date);
}

/**
 * Get UTC offset string (e.g., "UTC-4", "UTC+5:30").
 * @param {Date} date
 * @returns {string}
 */
export function getUtcOffsetString(date) {
  const offsetMin = date.getTimezoneOffset();
  if (offsetMin === 0) return "UTC";
  const sign = offsetMin > 0 ? "-" : "+";
  const absMin = Math.abs(offsetMin);
  const hours = Math.floor(absMin / 60);
  const mins = absMin % 60;
  return mins > 0
    ? `UTC${sign}${hours}:${String(mins).padStart(2, "0")}`
    : `UTC${sign}${hours}`;
}

/**
 * Format a Date for clock display.
 * @param {Date} date
 * @param {boolean} use24Hour
 * @returns {{hours: string, minutes: string, seconds: string, ampm: string}}
 */
export function formatTime(date, use24Hour = false) {
  let hours = date.getHours();
  let ampm = "";
  if (!use24Hour) {
    ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
  }
  return {
    hours: String(hours).padStart(2, "0"),
    minutes: String(date.getMinutes()).padStart(2, "0"),
    seconds: String(date.getSeconds()).padStart(2, "0"),
    ampm,
  };
}

/**
 * Format a date string for display (e.g., "Thursday, March 19, 2026").
 * @param {Date} date
 * @returns {string}
 */
export function formatDateString(date) {
  try {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    // Manual fallback
  }
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
