// generates calendar dates for a weekly recurring slot pattern
// day-of-week convention used by the recurrence_patterns table: 0=monday, 1=tuesday ... 6=sunday
// this differs from iso 8601 (1=mon..7=sun) and js Date.getDay() (0=sun..6=sat)
// luxon uses 1=mon..7=sun internally, so we add 1 when converting
import { DateTime } from 'luxon';

// returns the first calendar date on or after startDate that falls on the given weekday (0=mon..6=sun)
function firstOccurrenceOnOrAfter(startDateStr, dow0) {
  const dt = DateTime.fromISO(String(startDateStr).slice(0, 10), {
    zone: 'America/Montreal',
  }).startOf('day');
  const luxonDow = dow0 + 1; // luxon: monday=1 .. sunday=7
  const delta = (luxonDow - dt.weekday + 7) % 7;
  return dt.plus({ days: delta });
}

// returns an array of YYYY-MM-DD strings for numWeeks consecutive weekly occurrences
// starting from the first matching weekday on or after startDate
export function weeklyOccurrenceDates(startDateStr, dow0, numWeeks) {
  const first = firstOccurrenceOnOrAfter(startDateStr, dow0);
  const dates = [];
  for (let w = 0; w < numWeeks; w++) {
    dates.push(first.plus({ weeks: w }).toISODate());
  }
  return dates;
}
