// student books a slot with row locks and conflict checks; cancel frees the slot and notifies owner
import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import { rangesOverlap, normalizeTime } from '../utils/slotTime.js';
import { sameCalendarDay, formatDateOnly } from '../utils/dateSlot.js';
import { buildMailtoUri } from '../utils/mailto.js';

export const bookSlot = asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const slotId = req.params.id;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [locked] = await connection.query(
      `SELECT id, owner_id, date, start_time, end_time, status
       FROM booking_slots
       WHERE id = ?
         AND TIMESTAMP(date, end_time) > NOW()
       FOR UPDATE`,
      [slotId]
    );

    const slot = locked[0];
    if (!slot) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Slot not found or no longer bookable',
      });
    }

    if (slot.owner_id === userId) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: 'You cannot book your own slot',
      });
    }

    if (slot.status !== 'active') {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Slot is no longer available',
      });
    }

    const [myBookings] = await connection.query(
      `SELECT id, date, start_time, end_time
       FROM booking_slots
       WHERE booked_by = ? AND status = 'booked' AND id != ?`,
      [userId, slotId]
    );

    const sStart = normalizeTime(slot.start_time);
    const sEnd = normalizeTime(slot.end_time);

    for (const b of myBookings) {
      if (!sameCalendarDay(b.date, slot.date)) {
        continue;
      }
      const bStart = normalizeTime(b.start_time);
      const bEnd = normalizeTime(b.end_time);
      if (rangesOverlap(sStart, sEnd, bStart, bEnd)) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: 'You already have another booking that overlaps this time',
        });
      }
    }

    const [upd] = await connection.query(
      `UPDATE booking_slots
       SET status = 'booked', booked_by = ?, booked_at = NOW()
       WHERE id = ? AND status = 'active'`,
      [userId, slotId]
    );

    if (upd.affectedRows === 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Slot is no longer available',
      });
    }

    await connection.commit();

    const [rows] = await pool.query(
      `SELECT bs.id, bs.owner_id, bs.date, bs.start_time, bs.end_time, bs.status, bs.booked_by, bs.booked_at,
              o.email AS owner_email, o.first_name AS owner_first_name, o.last_name AS owner_last_name,
              u.first_name AS booker_first_name, u.last_name AS booker_last_name
       FROM booking_slots bs
       INNER JOIN users o ON bs.owner_id = o.id
       INNER JOIN users u ON u.id = ?
       WHERE bs.id = ?`,
      [userId, slotId]
    );

    const row = rows[0];
    const dateStr = formatDateOnly(row.date);
    const timeStr = String(row.start_time).slice(0, 5);
    const bookerName = [row.booker_first_name, row.booker_last_name].filter(Boolean).join(' ') || 'A student';
    const notifyOwnerMailto = buildMailtoUri(
      row.owner_email,
      'McGill Bookings — new appointment booked',
      `${bookerName} booked your slot on ${dateStr} at ${timeStr}.\n\nView your dashboard to see the full details.`
    );

    sendOk(
      res,
      {
        slot: {
          id: row.id,
          date: dateStr,
          startTime: String(row.start_time).slice(0, 8),
          endTime: String(row.end_time).slice(0, 8),
          status: row.status,
          bookedAt: row.booked_at,
        },
        notifyOwnerMailto,
      },
      200,
      'Booked'
    );
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
});

export const cancelMySlotBooking = asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const slotId = req.params.slotId;

  const [rows] = await pool.query(
    `SELECT s.id, s.status, s.date, s.start_time, s.end_time,
            o.email AS owner_email, o.first_name AS owner_first_name, o.last_name AS owner_last_name
     FROM booking_slots s
     INNER JOIN users o ON s.owner_id = o.id
     WHERE s.id = ? AND s.booked_by = ?
     LIMIT 1`,
    [slotId, userId]
  );

  if (!rows.length) {
    return res.status(404).json({
      success: false,
      message: 'Booking not found or not yours',
    });
  }

  const row = rows[0];
  if (row.status !== 'booked') {
    return res.status(409).json({
      success: false,
      message: 'This slot is not an active booking',
    });
  }

  await pool.query(
    `UPDATE booking_slots
     SET status = 'active', booked_by = NULL, booked_at = NULL
     WHERE id = ? AND booked_by = ? AND status = 'booked'`,
    [slotId, userId]
  );

  const dateStr = formatDateOnly(row.date);
  const timeStr = String(row.start_time).slice(0, 5);
  const notifyOwnerMailto = buildMailtoUri(
    row.owner_email,
    'McGill Bookings — cancelled appointment',
    `I cancelled my booking for ${dateStr} at ${timeStr}.`
  );

  sendOk(
    res,
    {
      cancelled: true,
      notifyOwnerMailto,
    },
    200,
    'Booking cancelled'
  );
});
