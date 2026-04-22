// time parsing, normalisation, and comparison utilities
// all times are stored in mysql as TIME strings (HH:MM:SS)
// we compare times using minute-offsets from midnight to detect overlaps without full Date objects
// timezone note: slots are plain times in mysql; montreal tz is only for ics export
import { DateTime } from 'luxon';

// normalise a time string to HH:MM:SS for mysql storage
// accepts "H:MM", "HH:MM", "HH:MM:SS"
export function normalizeTime(t) {
  const s = String(t).trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`;
  }
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) {
    const [h, m, sec] = s.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${sec.padStart(2, '0')}`;
  }
  return s; // already hh:mm:ss
}

// minutes elapsed since midnight (used for overlap comparison)
export function timeToMinutes(t) {
  const norm = normalizeTime(t);
  const [h, m, sec] = norm.split(':').map((x) => parseInt(x, 10));
  return h * 60 + m + (sec || 0) / 60;
}

// true when [startA, endA) and [startB, endB) overlap
// uses half-open intervals so back-to-back slots (e.g. 10:00-11:00 and 11:00-12:00) do not count as overlapping
export function rangesOverlap(startA, endA, startB, endB) {
  const a1 = timeToMinutes(startA);
  const a2 = timeToMinutes(endA);
  const b1 = timeToMinutes(startB);
  const b2 = timeToMinutes(endB);
  return a1 < b2 && b1 < a2;
}

// returns true when the slot starts strictly in the future relative to now
// evaluated in america/montreal so dates line up with local calendar
export function slotStartsInFuture(dateStr, startTime) {
  const start = normalizeTime(startTime);
  const [h, m, s] = start.split(':').map((x) => parseInt(x, 10));
  const [y, mo, d] = String(dateStr).slice(0, 10).split('-').map((x) => parseInt(x, 10));
  const slotDt = DateTime.fromObject(
    { year: y, month: mo, day: d, hour: h, minute: m, second: s || 0 },
    { zone: 'America/Montreal' }
  );
  if (!slotDt.isValid) return false;
  return slotDt > DateTime.now().setZone('America/Montreal');
}

// returns true for strings that match YYYY-MM-DD and represent a real calendar date
export function isValidDateString(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return false;
  const t = new Date(`${d}T12:00:00`);
  return !Number.isNaN(t.getTime());
}
