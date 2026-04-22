// type 3 booking: weekly recurrence patterns
// create: inserts draft booking_slots per generated week so the owner can bulk activate
// delete: removes draft or active slots for the pattern; booked slots go back to active and return mailto links
import { DateTime } from 'luxon';
import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk, sendCreated } from '../utils/apiResponse.js';
import { formatDateOnly } from '../utils/dateSlot.js';
import {
  normalizeTime,
  timeToMinutes,
  isValidDateString,
  slotStartsInFuture,
} from '../utils/slotTime.js';
import { weeklyOccurrenceDates } from '../utils/recurrenceDates.js';
import { ownerHasOverlappingSlot } from '../utils/slotOverlap.js';
import { buildMailtoUri } from '../utils/mailto.js';

function mapPatternRow(r, slotCount = null) {
  const out = {
    id: r.id,
    ownerId: r.owner_id,
    dayOfWeek: r.day_of_week,
    startTime: String(r.start_time).slice(0, 8),
    endTime: String(r.end_time).slice(0, 8),
    startDate: formatDateOnly(r.start_date),
    numWeeks: r.num_weeks,
    createdAt: r.created_at,
  };
  if (slotCount !== null) {
    out.slotCount = slotCount;
  }
  return out;
}

export const createRecurrencePatterns = asyncHandler(async (req, res) => {
  const ownerId = req.session.userId;
  const patternsIn = req.body.patterns;
  const startDate = req.body.startDate;
  let numWeeks = parseInt(req.body.numWeeks, 10);

  if (!Array.isArray(patternsIn) || patternsIn.length === 0) {
    return res.status(422).json({
      success: false,
      message: 'patterns must be a non-empty array',
    });
  }
  if (!startDate || !isValidDateString(startDate)) {
    return res.status(422).json({
      success: false,
      message: 'startDate must be YYYY-MM-DD',
    });
  }
  if (Number.isNaN(numWeeks) || numWeeks < 1) {
    return res.status(422).json({
      success: false,
      message: 'numWeeks must be at least 1',
    });
  }
  if (numWeeks > 52) {
    numWeeks = 52;
  }

  // start date must be today or later in montreal local midnight
  const startDt = DateTime.fromISO(startDate, { zone: 'America/Montreal' }).startOf('day');
  if (!startDt.isValid || startDt < DateTime.now().setZone('America/Montreal').startOf('day')) {
    return res.status(422).json({
      success: false,
      message: 'startDate must be today or in the future',
    });
  }

  const normalized = [];
  for (let i = 0; i < patternsIn.length; i++) {
    const p = patternsIn[i];
    const dow = parseInt(p?.dayOfWeek, 10);
    const st = p?.startTime;
    const et = p?.endTime;
    if (Number.isNaN(dow) || dow < 0 || dow > 6) {
      return res.status(422).json({
        success: false,
        message: `patterns[${i}]: dayOfWeek must be 0–6 (Mon–Sun)`,
      });
    }
    if (st == null || et == null) {
      return res.status(422).json({
        success: false,
        message: `patterns[${i}]: startTime and endTime required`,
      });
    }
    const start = normalizeTime(st);
    const end = normalizeTime(et);
    if (timeToMinutes(end) <= timeToMinutes(start)) {
      return res.status(422).json({
        success: false,
        message: `patterns[${i}]: endTime must be after startTime`,
      });
    }
    normalized.push({ dayOfWeek: dow, start, end });
  }

  const connection = await pool.getConnection();
  let slotsGenerated = 0;
  const createdPatterns = [];

  try {
    await connection.beginTransaction();

    for (const p of normalized) {
      const [insRp] = await connection.query(
        `INSERT INTO recurrence_patterns
          (owner_id, day_of_week, start_time, end_time, start_date, num_weeks)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [ownerId, p.dayOfWeek, p.start, p.end, startDate, numWeeks]
      );
      const patternId = insRp.insertId;

      const dates = weeklyOccurrenceDates(startDate, p.dayOfWeek, numWeeks);
      for (const d of dates) {
        if (!slotStartsInFuture(d, p.start)) {
          // skip times already passed when start date is today
          continue;
        }
        if (await ownerHasOverlappingSlot(connection, ownerId, d, p.start, p.end)) {
          await connection.rollback();
          return res.status(422).json({
            success: false,
            message: `A generated slot on ${d} would overlap an existing slot`,
          });
        }
        await connection.query(
          `INSERT INTO booking_slots
            (owner_id, date, start_time, end_time, status, slot_type, recurrence_id)
           VALUES (?, ?, ?, ?, 'draft', 'office_hours', ?)`,
          [ownerId, d, p.start, p.end, patternId]
        );
        slotsGenerated += 1;
      }

      const [pr] = await connection.query(
        'SELECT * FROM recurrence_patterns WHERE id = ?',
        [patternId]
      );
      createdPatterns.push(mapPatternRow(pr[0]));
    }

    await connection.commit();

    sendCreated(
      res,
      {
        patterns: createdPatterns,
        slotsGenerated,
      },
      'Recurrence patterns created'
    );
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
});

export const listMyRecurrencePatterns = asyncHandler(async (req, res) => {
  const ownerId = req.session.userId;

  const [rows] = await pool.query(
    `SELECT rp.id, rp.owner_id, rp.day_of_week, rp.start_time, rp.end_time,
            rp.start_date, rp.num_weeks, rp.created_at,
            COUNT(bs.id) AS slot_count
     FROM recurrence_patterns rp
     LEFT JOIN booking_slots bs ON bs.recurrence_id = rp.id
     WHERE rp.owner_id = ?
     GROUP BY rp.id
     ORDER BY rp.created_at DESC`,
    [ownerId]
  );

  const patterns = rows.map((r) =>
    mapPatternRow(r, Number(r.slot_count))
  );

  sendOk(res, { patterns });
});

export const deleteRecurrencePattern = asyncHandler(async (req, res) => {
  const ownerId = req.session.userId;
  const patternId = req.params.id;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rp] = await connection.query(
      'SELECT id FROM recurrence_patterns WHERE id = ? AND owner_id = ? FOR UPDATE',
      [patternId, ownerId]
    );
    if (!rp.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Pattern not found' });
    }

    // snapshot booked slots before deletes so we can build cancel mailto links
    const [bookedSlots] = await connection.query(
      `SELECT s.id, s.date, s.start_time, u.email AS booker_email
       FROM booking_slots s
       INNER JOIN users u ON s.booked_by = u.id
       WHERE s.recurrence_id = ? AND s.status = 'booked'`,
      [patternId]
    );

    // remove draft and active slots tied to this pattern
    const [delResult] = await connection.query(
      `DELETE FROM booking_slots
       WHERE recurrence_id = ? AND status IN ('draft', 'active')`,
      [patternId]
    );

    // free booked slots back to active so students get a mailto cancel notice
    if (bookedSlots.length > 0) {
      const bookedIds = bookedSlots.map((s) => s.id);
      await connection.query(
        `UPDATE booking_slots
         SET status = 'active', booked_by = NULL, booked_at = NULL, recurrence_id = NULL
         WHERE id IN (${bookedIds.map(() => '?').join(',')})`,
        bookedIds
      );
    }

    await connection.query('DELETE FROM recurrence_patterns WHERE id = ?', [patternId]);

    await connection.commit();

    // one mailto per affected booker for the owner to send manually
    const cancelMailtos = bookedSlots.map((s) => {
      const dateStr = formatDateOnly(s.date);
      const timeStr = String(s.start_time).slice(0, 5);
      return {
        bookerEmail: s.booker_email,
        slotId: s.id,
        mailto: buildMailtoUri(
          s.booker_email,
          'McGill Bookings — appointment cancelled',
          `Your booking on ${dateStr} at ${timeStr} has been cancelled because the recurring series was deleted.`
        ),
      };
    });

    sendOk(
      res,
      {
        deletedPatternId: Number(patternId),
        removedSlots: delResult.affectedRows + bookedSlots.length,
        ...(cancelMailtos.length > 0 && { cancelMailtos }),
      },
      200,
      'Recurrence pattern deleted'
    );
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
});
