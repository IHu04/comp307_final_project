// type 1 booking: direct meeting requests between student and owner
// student creates pending request; owner accepts with date and time or declines
// accept inserts booking_slots and returns a mailto so the owner can email the student
import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk, sendCreated } from '../utils/apiResponse.js';
import { buildMailtoUri } from '../utils/mailto.js';
import { formatDateOnly } from '../utils/dateSlot.js';
import { normalizeTime, isValidDateString, timeToMinutes, slotStartsInFuture } from '../utils/slotTime.js';
import { ownerHasOverlappingSlot, userHasOverlappingBooking } from '../utils/slotOverlap.js';

function fullName(first, last) {
  return [first, last].filter(Boolean).join(' ').trim() || 'Unknown';
}

function mapRequestRow(r) {
  return {
    id: r.id,
    requesterId: r.requester_id,
    ownerId: r.owner_id,
    message: r.message,
    status: r.status,
    createdSlotId: r.created_slot_id,
    createdAt: r.created_at,
  };
}

export const createMeetingRequest = asyncHandler(async (req, res) => {
  const requesterId = req.session.userId;
  const ownerId = parseInt(req.body.ownerId, 10);
  const message = req.body.message != null ? String(req.body.message).trim() : null;

  if (Number.isNaN(ownerId) || ownerId < 1) {
    return res.status(422).json({ success: false, message: 'ownerId must be a positive integer' });
  }

  if (ownerId === requesterId) {
    return res.status(422).json({ success: false, message: 'You cannot send a meeting request to yourself' });
  }

  const [owners] = await pool.query(
    'SELECT id, email, first_name, last_name FROM users WHERE id = ? AND is_owner = 1 LIMIT 1',
    [ownerId]
  );
  if (!owners.length) {
    return res.status(422).json({
      success: false,
      message: 'Owner not found or user is not an owner',
    });
  }

  const owner = owners[0];

  const [pendingDup] = await pool.query(
    `SELECT id FROM meeting_requests
     WHERE requester_id = ? AND owner_id = ? AND status = 'pending'
     LIMIT 1`,
    [requesterId, ownerId]
  );
  if (pendingDup.length) {
    return res.status(409).json({
      success: false,
      message: 'You already have a pending request to this owner',
    });
  }

  const [ins] = await pool.query(
    `INSERT INTO meeting_requests (requester_id, owner_id, message, status)
     VALUES (?, ?, ?, 'pending')`,
    [requesterId, ownerId, message || null]
  );

  const [rows] = await pool.query(
    `SELECT mr.id, mr.requester_id, mr.owner_id, mr.message, mr.status, mr.created_slot_id, mr.created_at,
            r.first_name AS requester_fn, r.last_name AS requester_ln, r.email AS requester_email
     FROM meeting_requests mr
     INNER JOIN users r ON mr.requester_id = r.id
     WHERE mr.id = ?`,
    [ins.insertId]
  );

  const row = rows[0];
  const requesterName = fullName(row.requester_fn, row.requester_ln);
  const notifyOwnerMailto = buildMailtoUri(
    owner.email,
    'McGill Bookings — new meeting request',
    `${requesterName} (${row.requester_email}) sent you a meeting request.\n\n${message ? `Message:\n${message}\n` : ''}\nOpen your dashboard to accept or decline.`
  );

  sendCreated(
    res,
    {
      request: mapRequestRow(row),
      notifyOwnerMailto,
    },
    'Meeting request sent'
  );
});

const ALLOWED_STATUS_FILTERS = ['pending', 'accepted', 'declined'];

export const listReceivedRequests = asyncHandler(async (req, res) => {
  const ownerId = req.session.userId;
  const raw = req.query.status;
  let conditions = 'mr.owner_id = ?';
  const params = [ownerId];

  if (raw !== undefined && raw !== '') {
    const s = String(raw).toLowerCase();
    if (!ALLOWED_STATUS_FILTERS.includes(s)) {
      return res.status(422).json({
        success: false,
        message: `status must be one of: ${ALLOWED_STATUS_FILTERS.join(', ')}`,
      });
    }
    conditions += ' AND mr.status = ?';
    params.push(s);
  }

  const [rows] = await pool.query(
    `SELECT mr.id, mr.requester_id, mr.owner_id, mr.message, mr.status, mr.created_slot_id, mr.created_at,
            r.first_name AS requester_fn, r.last_name AS requester_ln, r.email AS requester_email
     FROM meeting_requests mr
     INNER JOIN users r ON mr.requester_id = r.id
     WHERE ${conditions}
     ORDER BY mr.created_at DESC`,
    params
  );

  const requests = rows.map((r) => ({
    ...mapRequestRow(r),
    requester: {
      id: r.requester_id,
      firstName: r.requester_fn,
      lastName: r.requester_ln,
      email: r.requester_email,
      name: fullName(r.requester_fn, r.requester_ln),
    },
  }));

  sendOk(res, { requests });
});

export const listSentRequests = asyncHandler(async (req, res) => {
  const requesterId = req.session.userId;

  const [rows] = await pool.query(
    `SELECT mr.id, mr.requester_id, mr.owner_id, mr.message, mr.status, mr.created_slot_id, mr.created_at,
            o.first_name AS owner_fn, o.last_name AS owner_ln, o.email AS owner_email
     FROM meeting_requests mr
     INNER JOIN users o ON mr.owner_id = o.id
     WHERE mr.requester_id = ?
     ORDER BY mr.created_at DESC`,
    [requesterId]
  );

  const requests = rows.map((r) => ({
    ...mapRequestRow(r),
    owner: {
      id: r.owner_id,
      firstName: r.owner_fn,
      lastName: r.owner_ln,
      email: r.owner_email,
      name: fullName(r.owner_fn, r.owner_ln),
    },
  }));

  sendOk(res, { requests });
});

export const updateMeetingRequest = asyncHandler(async (req, res) => {
  const ownerId = req.session.userId;
  const requestId = req.params.id;
  const status = String(req.body.status || '').toLowerCase();

  if (status !== 'accepted' && status !== 'declined') {
    return res.status(422).json({
      success: false,
      message: "status must be 'accepted' or 'declined'",
    });
  }

  const date = req.body.date;
  const startTime = req.body.startTime;
  const endTime = req.body.endTime;

  if (status === 'accepted') {
    if (!date || !startTime || !endTime) {
      return res.status(422).json({
        success: false,
        message: 'date, startTime, and endTime are required when accepting',
      });
    }
    if (!isValidDateString(date)) {
      return res.status(422).json({ success: false, message: 'date must be YYYY-MM-DD' });
    }
    const st = normalizeTime(startTime);
    const et = normalizeTime(endTime);
    if (timeToMinutes(et) <= timeToMinutes(st)) {
      return res.status(422).json({
        success: false,
        message: 'endTime must be after startTime',
      });
    }
    if (!slotStartsInFuture(date, st)) {
      return res.status(422).json({
        success: false,
        message: 'The accepted meeting time must be in the future',
      });
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [locked] = await connection.query(
      `SELECT mr.id, mr.requester_id, mr.owner_id, mr.message, mr.status,
              r.email AS requester_email, r.first_name AS requester_fn, r.last_name AS requester_ln
       FROM meeting_requests mr
       INNER JOIN users r ON mr.requester_id = r.id
       WHERE mr.id = ? AND mr.owner_id = ?
       FOR UPDATE`,
      [requestId, ownerId]
    );

    if (!locked.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const mr = locked[0];
    if (mr.status !== 'pending') {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'This request is no longer pending',
      });
    }

    const requesterName = fullName(mr.requester_fn, mr.requester_ln);

    if (status === 'declined') {
      await connection.query(
        `UPDATE meeting_requests SET status = 'declined' WHERE id = ? AND status = 'pending'`,
        [requestId]
      );
      await connection.commit();

      const [afterDecline] = await pool.query(
        `SELECT id, requester_id, owner_id, message, status, created_slot_id, created_at
         FROM meeting_requests WHERE id = ?`,
        [requestId]
      );

      const notifyRequesterMailto = buildMailtoUri(
        mr.requester_email,
        'McGill Bookings — meeting request update',
        `Your meeting request was declined.\n\nYou can send another request from the app if needed.`
      );

      sendOk(
        res,
        {
          request: mapRequestRow(afterDecline[0]),
          notifyRequesterMailto,
        },
        200,
        'Request declined'
      );
      return;
    }

    const st = normalizeTime(startTime);
    const et = normalizeTime(endTime);

    if (await ownerHasOverlappingSlot(connection, ownerId, date, st, et)) {
      await connection.rollback();
      return res.status(422).json({
        success: false,
        message: 'That time overlaps another slot on your calendar',
      });
    }
    if (await userHasOverlappingBooking(connection, mr.requester_id, date, st, et)) {
      await connection.rollback();
      return res.status(422).json({
        success: false,
        message: 'That time overlaps another booking for the student',
      });
    }

    const [insertResult] = await connection.query(
      `INSERT INTO booking_slots
        (owner_id, date, start_time, end_time, status, slot_type, booked_by, booked_at)
       VALUES (?, ?, ?, ?, 'booked', 'meeting_request', ?, NOW())`,
      [ownerId, date, st, et, mr.requester_id]
    );

    const newSlotId = insertResult.insertId;

    await connection.query(
      `UPDATE meeting_requests
       SET status = 'accepted', created_slot_id = ?
       WHERE id = ? AND status = 'pending'`,
      [newSlotId, requestId]
    );

    await connection.commit();

    const dateStr = formatDateOnly(date);
    const notifyRequesterMailto = buildMailtoUri(
      mr.requester_email,
      'McGill Bookings — meeting request accepted',
      `Your meeting request was accepted.\n\nScheduled: ${dateStr} from ${String(st).slice(0, 5)} to ${String(et).slice(0, 5)}.`
    );

    const [updated] = await pool.query(
      `SELECT id, requester_id, owner_id, message, status, created_slot_id, created_at
       FROM meeting_requests WHERE id = ?`,
      [requestId]
    );

    sendOk(
      res,
      {
        request: mapRequestRow(updated[0]),
        createdSlotId: newSlotId,
        notifyRequesterMailto,
      },
      200,
      'Request accepted'
    );
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
});
