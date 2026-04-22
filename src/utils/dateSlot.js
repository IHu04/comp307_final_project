// utilities for working with mysql DATE values
// mysql2 returns DATE columns as js Date objects set to midnight utc
// we always use utc accessors so the formatted string is correct regardless of server timezone

// format a mysql DATE value (or any YYYY-MM-DD string) as "YYYY-MM-DD"
export function formatDateOnly(d) {
  if (d instanceof Date) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(d).slice(0, 10);
}

// returns true when two dates (Date objects or YYYY-MM-DD strings) fall on the same calendar day
export function sameCalendarDay(a, b) {
  return formatDateOnly(a) === formatDateOnly(b);
}
