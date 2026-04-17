import { DateTime } from 'luxon';

/**
 * day_of_week convention used throughout this app and in recurrence_patterns.day_of_week:
 *   0 = Monday, 1 = Tuesday, 2 = Wednesday, 3 = Thursday,
 *   4 = Friday, 5 = Saturday, 6 = Sunday
 *
 * This differs from ISO 8601 (which uses 1=Mon..7=Sun) and JS Date.getDay() (0=Sun..6=Sat).
 * Luxon uses 1=Mon..7=Sun internally; we add 1 when converting (luxonDow = dow0 + 1).
 */

/**
 * First calendar date on or after startDate matching weekday.
 * @param {string} startDateStr - YYYY-MM-DD
 * @param {number} dow0 - 0=Monday..6=Sunday (app convention, see above)
 */
export function firstOccurrenceOnOrAfter(startDateStr, dow0) {
  const dt = DateTime.fromISO(String(startDateStr).slice(0, 10), {
    zone: 'America/Montreal',
  }).startOf('day');
  const luxonDow = dow0 + 1; // Luxon: Monday = 1 .. Sunday = 7
  const delta = (luxonDow - dt.weekday + 7) % 7;
  return dt.plus({ days: delta });
}

/**
 * List of YYYY-MM-DD for each week (numWeeks occurrences).
 */
export function weeklyOccurrenceDates(startDateStr, dow0, numWeeks) {
  const first = firstOccurrenceOnOrAfter(startDateStr, dow0);
  const dates = [];
  for (let w = 0; w < numWeeks; w++) {
    dates.push(first.plus({ weeks: w }).toISODate());
  }
  return dates;
}
