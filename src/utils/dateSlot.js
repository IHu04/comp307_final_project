/** Compare MySQL DATE / string as YYYY-MM-DD */
export function sameCalendarDay(a, b) {
  return formatDateOnly(a) === formatDateOnly(b);
}

/**
 * Format a MySQL DATE value as YYYY-MM-DD.
 * mysql2 returns DATE columns as JS Date objects set to midnight UTC.
 * Use UTC accessors so the date is correct on any server timezone (including EDT/EST).
 */
export function formatDateOnly(d) {
  if (d instanceof Date) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(d).slice(0, 10);
}
