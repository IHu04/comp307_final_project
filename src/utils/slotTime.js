import { DateTime } from 'luxon';

/** Normalize to HH:MM:SS for MySQL TIME */
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
  return s;
}

/** Minutes from midnight for comparisons */
export function timeToMinutes(t) {
  const norm = normalizeTime(t);
  const [h, m, sec] = norm.split(':').map((x) => parseInt(x, 10));
  return h * 60 + m + (sec || 0) / 60;
}

export function rangesOverlap(startA, endA, startB, endB) {
  const a1 = timeToMinutes(startA);
  const a2 = timeToMinutes(endA);
  const b1 = timeToMinutes(startB);
  const b2 = timeToMinutes(endB);
  return a1 < b2 && b1 < a2;
}

/** YYYY-MM-DD + time string must be strictly after now (evaluated in America/Montreal). */
export function slotStartsInFuture(dateStr, startTime) {
  const start = normalizeTime(startTime);
  const [h, m, s] = start.split(':').map((x) => parseInt(x, 10));
  const [y, mo, d] = String(dateStr).slice(0, 10).split('-').map((x) => parseInt(x, 10));
  const slotDt = DateTime.fromObject(
    { year: y, month: mo, day: d, hour: h, minute: m, second: s || 0 },
    { zone: 'America/Montreal' }
  );
  if (!slotDt.isValid) {
    return false;
  }
  return slotDt > DateTime.now().setZone('America/Montreal');
}

export function isValidDateString(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) {
    return false;
  }
  const t = new Date(`${d}T12:00:00`);
  return !Number.isNaN(t.getTime());
}
