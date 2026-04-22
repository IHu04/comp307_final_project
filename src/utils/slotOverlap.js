// db-level overlap queries used before inserting or activating slots
// both functions accept an active connection so they can run inside a caller-controlled transaction
import { normalizeTime, rangesOverlap } from './slotTime.js';
import { sameCalendarDay } from './dateSlot.js';

// returns true when the owner already has a slot in draft/active/booked status
// whose time overlaps [start, end] on the given date
// pass excludeSlotId to ignore a specific slot (e.g. the one being activated)
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

// returns true when the user already has a booked slot on the same calendar day
// whose time overlaps [start, end]
// fetches all of the user's bookings in one query then filters in js
export async function userHasOverlappingBooking(connection, userId, date, start, end, { excludeSlotId } = {}) {
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
    if (!sameCalendarDay(b.date, date)) continue;
    if (rangesOverlap(st, et, normalizeTime(b.start_time), normalizeTime(b.end_time))) return true;
  }
  return false;
}
