import { normalizeTime, rangesOverlap } from './slotTime.js';
import { sameCalendarDay } from './dateSlot.js';

/**
 * True if the owner already has a non-cancelled slot overlapping [start, end] on date.
 * @param {number|null} [excludeSlotId] - ignore this slot (e.g. the draft being activated).
 */
export async function ownerHasOverlappingSlot(connection, ownerId, date, start, end, excludeSlotId = null) {
  let sql = `SELECT id FROM booking_slots
     WHERE owner_id = ? AND date = ? AND status IN ('draft', 'active', 'booked')
       AND start_time < ? AND end_time > ?`;
  const params = [ownerId, date, end, start];
  if (excludeSlotId != null) {
    sql += ' AND id != ?';
    params.push(excludeSlotId);
  }
  sql += ' LIMIT 1';
  const [hit] = await connection.query(sql, params);
  return hit.length > 0;
}

/**
 * True if the user has a booked slot on the same calendar day that time-overlaps [start, end].
 */
export async function userHasOverlappingBooking(
  connection,
  userId,
  date,
  start,
  end,
  { excludeSlotId } = {}
) {
  let sql = `SELECT id, date, start_time, end_time FROM booking_slots
     WHERE booked_by = ? AND status = 'booked'`;
  const params = [userId];
  if (excludeSlotId != null) {
    sql += ' AND id != ?';
    params.push(excludeSlotId);
  }
  const [rows] = await connection.query(sql, params);
  const st = normalizeTime(start);
  const et = normalizeTime(end);
  for (const b of rows) {
    if (!sameCalendarDay(b.date, date)) {
      continue;
    }
    const bStart = normalizeTime(b.start_time);
    const bEnd = normalizeTime(b.end_time);
    if (rangesOverlap(st, et, bStart, bEnd)) {
      return true;
    }
  }
  return false;
}
