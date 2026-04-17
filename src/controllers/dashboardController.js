import ical from 'ical-generator';
import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import { formatDateOnly } from '../utils/dateSlot.js';
import { buildMailtoUri } from '../utils/mailto.js';
import { slotDateTimesInMontreal } from '../utils/montrealSlot.js';

function fullName(first, last) {
  return [first, last].filter(Boolean).join(' ').trim() || 'Unknown';
}

function mapStudentRow(row) {
  const ownerName = fullName(row.owner_fn, row.owner_ln);
  const otherParty = {
    name: ownerName,
    email: row.owner_email,
  };
  const mailtoUri = buildMailtoUri(
    row.owner_email,
    'McGill Bookings — office hours',
    `Hello,\n\nRegarding my booking on ${formatDateOnly(row.date)}.\n`
  );
  const booked = row.status === 'booked';
  return {
    slotId: row.id,
    date: formatDateOnly(row.date),
    startTime: String(row.start_time).slice(0, 8),
    endTime: String(row.end_time).slice(0, 8),
    status: row.status,
    otherParty,
    mailtoUri,
    canCancel: booked,
  };
}

function mapOwnerSlotRow(row) {
  const booked = row.status === 'booked' && row.booked_by;
  let otherParty = null;
  let mailtoUri = null;
  if (booked && row.booker_email) {
    const bookerName = fullName(row.booker_fn, row.booker_ln);
    otherParty = { name: bookerName, email: row.booker_email };
    mailtoUri = buildMailtoUri(
      row.booker_email,
      'McGill Bookings — your office hours slot',
      `Hello,\n\nRegarding the slot on ${formatDateOnly(row.date)}.\n`
    );
  }
  return {
    slotId: row.id,
    date: formatDateOnly(row.date),
    startTime: String(row.start_time).slice(0, 8),
    endTime: String(row.end_time).slice(0, 8),
    status: row.status,
    otherParty,
    mailtoUri,
    canCancel: Boolean(booked),
  };
}

export const getDashboard = asyncHandler(async (req, res) => {
  const userId = req.session.userId;

  const [users] = await pool.query(
    'SELECT id, is_owner FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  if (!users.length) {
    return res.status(401).json({ success: false, message: 'User not found' });
  }

  const isOwner = Boolean(users[0].is_owner);

  if (isOwner) {
    const [slots] = await pool.query(
      `SELECT s.id, s.date, s.start_time, s.end_time, s.status, s.booked_by,
              b.first_name AS booker_fn, b.last_name AS booker_ln, b.email AS booker_email
       FROM booking_slots s
       LEFT JOIN users b ON s.booked_by = b.id
       WHERE s.owner_id = ?
       ORDER BY s.date ASC, s.start_time ASC`,
      [userId]
    );

    const [pending] = await pool.query(
      `SELECT mr.id, mr.message, mr.created_at,
              r.id AS requester_id, r.first_name AS requester_fn,
              r.last_name AS requester_ln, r.email AS requester_email
       FROM meeting_requests mr
       INNER JOIN users r ON mr.requester_id = r.id
       WHERE mr.owner_id = ? AND mr.status = 'pending'
       ORDER BY mr.created_at DESC`,
      [userId]
    );

    const meetingRequestsPending = pending.map((r) => ({
      id: r.id,
      message: r.message,
      createdAt: r.created_at,
      requester: {
        id: r.requester_id,
        firstName: r.requester_fn,
        lastName: r.requester_ln,
        email: r.requester_email,
        name: fullName(r.requester_fn, r.requester_ln),
      },
    }));

    sendOk(res, {
      isOwner: true,
      appointments: slots.map(mapOwnerSlotRow),
      meetingRequestsPending,
    });
    return;
  }

  // Include slots directly booked by this user AND group_meeting slots where
  // the user is a participant (booked_by is NULL on those because the slot belongs
  // to the owner, not any single attendee).
  const [slots] = await pool.query(
    `SELECT s.id, s.date, s.start_time, s.end_time, s.status,
            o.first_name AS owner_fn, o.last_name AS owner_ln, o.email AS owner_email
     FROM booking_slots s
     INNER JOIN users o ON s.owner_id = o.id
     WHERE s.status != 'draft'
       AND (
         s.booked_by = ?
         OR (
           s.slot_type = 'group_meeting'
           AND s.status = 'booked'
           AND EXISTS (
             SELECT 1 FROM group_meeting_participants gmp
             WHERE gmp.group_meeting_id = s.group_meeting_id
               AND gmp.user_id = ?
           )
         )
       )
     ORDER BY s.date ASC, s.start_time ASC`,
    [userId, userId]
  );

  sendOk(res, {
    isOwner: false,
    appointments: slots.map(mapStudentRow),
    meetingRequestsPending: [],
  });
});

export const exportAppointmentsIcs = asyncHandler(async (req, res) => {
  const userId = req.session.userId;

  const [users] = await pool.query(
    'SELECT id, is_owner, first_name, last_name, email FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  if (!users.length) {
    return res.status(401).json({ success: false, message: 'User not found' });
  }

  const me = users[0];
  const myName = fullName(me.first_name, me.last_name);

  let rows;
  if (me.is_owner) {
    [rows] = await pool.query(
      `SELECT s.date, s.start_time, s.end_time,
              b.first_name AS other_fn, b.last_name AS other_ln, b.email AS other_email
       FROM booking_slots s
       INNER JOIN users b ON s.booked_by = b.id
       WHERE s.owner_id = ? AND s.status = 'booked' AND s.booked_by IS NOT NULL
       ORDER BY s.date ASC, s.start_time ASC`,
      [userId]
    );
  } else {
    [rows] = await pool.query(
      `SELECT s.date, s.start_time, s.end_time,
              o.first_name AS other_fn, o.last_name AS other_ln, o.email AS other_email
       FROM booking_slots s
       INNER JOIN users o ON s.owner_id = o.id
       WHERE s.status = 'booked'
         AND (
           s.booked_by = ?
           OR (
             s.slot_type = 'group_meeting'
             AND EXISTS (
               SELECT 1 FROM group_meeting_participants gmp
               WHERE gmp.group_meeting_id = s.group_meeting_id
                 AND gmp.user_id = ?
             )
           )
         )
       ORDER BY s.date ASC, s.start_time ASC`,
      [userId, userId]
    );
  }

  const calendar = ical({
    name: 'McGill Bookings',
    timezone: 'America/Montreal',
  });

  for (const row of rows) {
    const otherName = fullName(row.other_fn, row.other_ln);
    const { start, end, zone } = slotDateTimesInMontreal(
      formatDateOnly(row.date),
      row.start_time,
      row.end_time
    );

    calendar.createEvent({
      start: start.toJSDate(),
      end: end.toJSDate(),
      timezone: zone,
      summary: `Meeting with ${otherName}`,
      description: 'McGill Bookings appointment',
      organizer: {
        name: myName,
        email: me.email,
      },
      attendees: [
        {
          email: row.other_email,
          name: otherName,
        },
      ],
    });
  }

  const body = calendar.toString();

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mcgill-bookings.ics"');
  res.status(200).send(body);
});
