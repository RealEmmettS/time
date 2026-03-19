/**
 * Timezone detection and formatting utilities.
 * Uses the browser's Intl API — no external dependencies.
 */

/** Detect the user's IANA timezone (e.g., "America/New_York"). */
export function detectTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Get UTC offset in minutes (e.g., -240 for EDT). */
export function getUtcOffsetMinutes() {
  return new Date().getTimezoneOffset();
}

/**
 * Get timezone abbreviation for a given date (e.g., "EDT", "PST").
 * @param {Date} date
 * @returns {string}
 */
export function getTimezoneAbbr(date) {
  const tz = detectTimezone();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return tzPart ? tzPart.value : '';
  } catch {
    return '';
  }
}

/**
 * Get UTC offset string (e.g., "UTC-4", "UTC+5:30").
 * @param {Date} date
 * @returns {string}
 */
export function getUtcOffsetString(date) {
  const offsetMin = date.getTimezoneOffset();
  if (offsetMin === 0) return 'UTC';
  const sign = offsetMin > 0 ? '-' : '+';
  const absMin = Math.abs(offsetMin);
  const hours = Math.floor(absMin / 60);
  const mins = absMin % 60;
  return mins > 0 ? `UTC${sign}${hours}:${String(mins).padStart(2, '0')}` : `UTC${sign}${hours}`;
}

/**
 * Format a Date for display.
 * @param {Date} date
 * @param {boolean} use24Hour
 * @returns {{hours: string, minutes: string, seconds: string, ampm: string, date: string}}
 */
export function formatTime(date, use24Hour = false) {
  let hours = date.getHours();
  let ampm = '';

  if (!use24Hour) {
    ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
  }

  return {
    hours: String(hours).padStart(2, '0'),
    minutes: String(date.getMinutes()).padStart(2, '0'),
    seconds: String(date.getSeconds()).padStart(2, '0'),
    ampm,
  };
}

/**
 * Format a date string for display (e.g., "Thursday, March 19, 2026").
 * @param {Date} date
 * @returns {string}
 */
export function formatDateString(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
