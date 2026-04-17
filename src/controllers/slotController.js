import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk, sendCreated } from '../utils/apiResponse.js';
import {
  normalizeTime,
  rangesOverlap,
  slotStartsInFuture,
  isValidDateString,
  timeToMinutes,
} from '../utils/slotTime.js';
import { buildMailtoUri } from '../utils/mailto.js';
import { ownerHasOverlappingSlot } from '../utils/slotOverlap.js';
import { formatDateOnly } from '../utils/dateSlot.js';

function mapSlot(row, booker = null) {
  return {
    id: row.id,
    date: formatDateOnly(row.date),
    startTime: String(row.start_time).slice(0, 8),
    endTime: String(row.end_time).slice(0, 8),
    status: row.status,
    slotType: row.slot_type,
    recurrenceId: row.recurrence_id,
    groupMeetingId: row.group_meeting_id,
    bookedAt: row.booked_at,
    booker,
  };
}

function batchOverlaps(slotsOnSameDay) {
  const n = slotsOnSameDay.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = slotsOnSameDay[i];
      const b = slotsOnSameDay[j];
      if (rangesOverlap(a.start, a.end, b.start, b.end)) {
        return true;
      }
    }
  }
  return false;
}

export const createSlots = asyncHandler(async (req, res) => {
  const ownerId = req.session.userId;
  const slotsIn = req.body.slots;

  if (!Array.isArray(slotsIn) || slotsIn.length === 0) {
    return res.status(422).json({
      success: false,
      message: 'slots must be a non-empty array',
    });
  }

  const normalized = [];
  for (let i = 0; i < slotsIn.length; i++) {
    const s = slotsIn[i];
    const date = s?.date;
    const startTime = s?.startTime;
    const endTime = s?.endTime;

    if (!date || startTime == null || endTime == null) {
      return res.status(422).json({
        success: false,
        message: `slots[${i}]: date, startTime, and endTime are required`,
      });
    }
    if (!isValidDateString(date)) {
      return res.status(422).json({
        success: false,
        message: `slots[${i}]: date must be YYYY-MM-DD`,
      });
    }

    const start = normalizeTime(startTime);
    const end = normalizeTime(endTime);

    if (timeToMinutes(end) <= timeToMinutes(start)) {
      return res.status(422).json({
        success: false,
        message: `slots[${i}]: endTime must be after startTime`,
      });
    }

    if (!slotStartsInFuture(date, start)) {
      return res.status(422).json({
        success: false,
        message: `slots[${i}]: slot must start in the future`,
      });
    }

    normalized.push({ date, start, end });
  }

  const byDate = new Map();
  for (const s of normalized) {
    if (!byDate.has(s.date)) {
      byDate.set(s.date, []);
    }
    byDate.get(s.date).push({ start: s.start, end: s.end });
  }
  for (const [, list] of byDate) {
    if (batchOverlaps(list)) {
      return res.status(422).json({
        success: false,
        message: 'Some new slots overlap each other on the same day',
      });
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const s of normalized) {
      if (await ownerHasOverlappingSlot(connection, ownerId, s.date, s.start, s.end)) {
        await connection.rollback();
        return res.status(422).json({
          success: false,
          message: `A slot on ${s.date} overlaps an existing slot`,
        });
      }
    }

    const created = [];
    for (const s of normalized) {
      const [result] = await connection.query(
        `INSERT INTO booking_slots
          (owner_id, date, start_time, end_time, status, slot_type)
         VALUES (?, ?, ?, ?, 'draft', 'office_hours')`,
        [ownerId, s.date, s.start, s.end]
      );
      const [rows] = await connection.query(
        `SELECT id, owner_id, date, start_time, end_time, status, slot_type,
                recurrence_id, group_meeting_id, booked_by, booked_at, created_at
         FROM booking_slots WHERE id = ?`,
        [result.insertId]
      );
      created.push(mapSlot(rows[0], null));
    }

    await connection.commit();
    sendCreated(res, { slots: created }, 'Slots created');
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
});

export const listMySlots = asyncHandler(async (req, res) => {
  const ownerId = req.session.userId;
  const [rows] = await pool.query(
    `SELECT s.id, s.owner_id, s.date, s.start_time, s.end_time, s.status, s.slot_type,
            s.recurrence_id, s.group_meeting_id, s.booked_by, s.booked_at, s.created_at,
            u.id AS booker_id, u.email AS booker_email,
            u.first_name AS booker_first_name, u.last_name AS booker_last_name
     FROM booking_slots s
     LEFT JOIN users u ON s.booked_by = u.id
     WHERE s.owner_id = ?
     ORDER BY s.date ASC, s.start_time ASC`,
    [ownerId]
  );

  const slots = rows.map((row) => {
    let booker = null;
    if (row.booker_id) {
      booker = {
        id: row.booker_id,
        email: row.booker_email,
        firstName: row.booker_first_name,
        lastName: row.booker_last_name,
      };
    }
    return mapSlot(row, booker);
  });

  sendOk(res, { slots });
});

export const activateSlot = asyncHandler(async (req, res) => {
  const ownerId = req.session.userId;
  const slotId = req.params.id;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [locked] = await connection.query(
      `SELECT id, date, start_time, end_time, status FROM booking_slots
       WHERE id = ? AND owner_id = ? FOR UPDATE`,
      [slotId, ownerId]
    );
    if (!locked.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Slot not found' });
    }
    const s = locked[0];
    if (s.status !== 'draft') {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Only draft slots can be activated',
      });
    }

    const dateStr = formatDateOnly(s.date);
    const st = normalizeTime(s.start_time);
    const et = normalizeTime(s.end_time);
    if (await ownerHasOverlappingSlot(connection, ownerId, dateStr, st, et, s.id)) {
      await connection.rollback();
      return res.status(422).json({
        success: false,
        message: 'Cannot activate: overlaps another slot on that day',
      });
    }

    await connection.query(
      `UPDATE booking_slots SET status = 'active'
       WHERE id = ? AND owner_id = ? AND status = 'draft'`,
      [slotId, ownerId]
    );
    await connection.commit();
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }

  const [rows] = await pool.query(
    `SELECT id, owner_id, date, start_time, end_time, status, slot_type,
            recurrence_id, group_meeting_id, booked_by, booked_at, created_at
     FROM booking_slots WHERE id = ?`,
    [slotId]
  );
  sendOk(res, { slot: mapSlot(rows[0], null) }, 200, 'Slot activated');
});

export const bulkActivateSlots = asyncHandler(async (req, res) => {
  const ownerId = req.session.userId;
  const raw = req.body.slotIds;
  if (!Array.isArray(raw) || raw.length === 0) {
    return res.status(422).json({
      success: false,
      message: 'slotIds must be a non-empty array',
    });
  }
  const slotIds = [...new Set(raw.map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n) && n > 0))];
  if (slotIds.length === 0) {
    return res.status(422).json({
      success: false,
      message: 'slotIds must contain positive integers',
    });
  }

  const connection = await pool.getConnection();
  const activatedIds = [];
  const skipped = [];
  try {
    await connection.beginTransaction();

    for (const sid of slotIds) {
      const [rows] = await connection.query(
        `SELECT id, date, start_time, end_time, status FROM booking_slots
         WHERE id = ? AND owner_id = ? FOR UPDATE`,
        [sid, ownerId]
      );
      if (!rows.length) {
        skipped.push({ id: sid, reason: 'not found' });
        continue;
      }
      if (rows[0].status !== 'draft') {
        skipped.push({ id: sid, reason: `already ${rows[0].status}` });
        continue;
      }
      const s = rows[0];
      const dateStr = formatDateOnly(s.date);
      const st = normalizeTime(s.start_time);
      const et = normalizeTime(s.end_time);
      if (await ownerHasOverlappingSlot(connection, ownerId, dateStr, st, et, s.id)) {
        skipped.push({ id: sid, reason: `overlaps another slot on ${dateStr}` });
        continue;
      }
      await connection.query(
        `UPDATE booking_slots SET status = 'active'
         WHERE id = ? AND owner_id = ? AND status = 'draft'`,
        [sid, ownerId]
      );
      activatedIds.push(sid);
    }

    await connection.commit();
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }

  sendOk(
    res,
    {
      requested: slotIds.length,
      activated: activatedIds.length,
      activatedIds,
      ...(skipped.length > 0 && { skipped }),
    },
    200,
    'Bulk activate complete'
  );
});

export const deactivateSlot = asyncHandler(async (req, res) => {
  const ownerId = req.session.userId;
  const slotId = req.params.id;

  const [check] = await pool.query(
    'SELECT status FROM booking_slots WHERE id = ? AND owner_id = ?',
    [slotId, ownerId]
  );
  if (!check.length) {
    return res.status(404).json({ success: false, message: 'Slot not found' });
  }
  if (check[0].status === 'booked') {
    return res.status(403).json({
      success: false,
      message: 'Cannot deactivate a booked slot',
    });
  }
  if (check[0].status !== 'active') {
    return res.status(409).json({
      success: false,
      message: 'Only active slots can be moved back to draft',
    });
  }

  await pool.query(
    `UPDATE booking_slots SET status = 'draft'
     WHERE id = ? AND owner_id = ? AND status = 'active'`,
    [slotId, ownerId]
  );

  const [rows] = await pool.query(
    `SELECT id, owner_id, date, start_time, end_time, status, slot_type,
            recurrence_id, group_meeting_id, booked_by, booked_at, created_at
     FROM booking_slots WHERE id = ?`,
    [slotId]
  );
  sendOk(res, { slot: mapSlot(rows[0], null) }, 200, 'Slot set to draft');
});

export const deleteSlot = asyncHandler(async (req, res) => {
  const ownerId = req.session.userId;
  const slotId = req.params.id;

  const [rows] = await pool.query(
    `SELECT s.id, s.status, s.date, s.start_time, s.end_time, u.email AS booker_email
     FROM booking_slots s
     LEFT JOIN users u ON s.booked_by = u.id
     WHERE s.id = ? AND s.owner_id = ?`,
    [slotId, ownerId]
  );

  if (!rows.length) {
    return res.status(404).json({ success: false, message: 'Slot not found' });
  }

  const row = rows[0];
  const wasBooked = row.status === 'booked' && row.booker_email;
  let cancelMailto = null;
  if (wasBooked) {
    cancelMailto = buildMailtoUri(
      row.booker_email,
      'Booking Cancelled',
      'Your booking for this office hours slot has been cancelled by the instructor.'
    );
  }

  await pool.query('DELETE FROM booking_slots WHERE id = ?', [slotId]);

  sendOk(
    res,
    {
      deleted: true,
      ...(cancelMailto && { cancelMailto }),
    },
    200,
    wasBooked ? 'Slot deleted; notify booker via cancelMailto' : 'Slot deleted'
  );
});

export const getSlotMailto = asyncHandler(async (req, res) => {
  const ownerId = req.session.userId;
  const slotId = req.params.id;

  const [rows] = await pool.query(
    `SELECT s.status, u.email AS booker_email, s.date, s.start_time, s.end_time
     FROM booking_slots s
     LEFT JOIN users u ON s.booked_by = u.id
     WHERE s.id = ? AND s.owner_id = ?`,
    [slotId, ownerId]
  );

  if (!rows.length) {
    return res.status(404).json({ success: false, message: 'Slot not found' });
  }

  const row = rows[0];
  if (row.status !== 'booked' || !row.booker_email) {
    return res.status(400).json({
      success: false,
      message: 'This slot has no booker to email',
    });
  }

  const dateStr = formatDateOnly(row.date);
  const mailto = buildMailtoUri(
    row.booker_email,
    'McGill Bookings — your appointment',
    `Regarding your booked slot on ${dateStr} at ${String(row.start_time).slice(0, 5)}.`
  );

  sendOk(res, { mailto });
});
