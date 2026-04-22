// interprets slot dates and times in america/montreal for ics calendar export
// slots are stored as plain DATE + TIME in mysql (no timezone)
// when building vevent entries we anchor them in the local timezone so calendar apps show the right time
import { DateTime } from 'luxon';
import { normalizeTime } from './slotTime.js';

const ZONE = 'America/Montreal';

// returns luxon datetime objects for the slot start and end, fixed to america/montreal
export function slotDateTimesInMontreal(dateStr, startTimeRaw, endTimeRaw) {
  const startT = normalizeTime(startTimeRaw);
  const endT   = normalizeTime(endTimeRaw);

  const [y, mo, d]       = String(dateStr).slice(0, 10).split('-').map((x) => parseInt(x, 10));
  const [sh, sm, ss]     = startT.split(':').map((x) => parseInt(x, 10));
  const [eh, em, es]     = endT.split(':').map((x) => parseInt(x, 10));

  const start = DateTime.fromObject({ year: y, month: mo, day: d, hour: sh, minute: sm, second: ss || 0 }, { zone: ZONE });
  const end   = DateTime.fromObject({ year: y, month: mo, day: d, hour: eh, minute: em, second: es || 0 }, { zone: ZONE });

  return { start, end, zone: ZONE };
}
