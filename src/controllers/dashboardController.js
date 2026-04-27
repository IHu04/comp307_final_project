// dashboard json by role and ics export for the current user
// owner sees their slots and pending items,student sees bookings and groups
// the /appointments/export route streams an ics file for calendar apps
import { webcrypto } from 'crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

import ical from 'ical-generator';
import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import { formatDateOnly } from '../utils/dateSlot.js';
import { buildMailtoUri } from '../utils/mailto.js';
import { slotDateTimesInMontreal } from '../utils/montrealSlot.js';
import { mapListItem as mapTeamRequestListItem } from './teamRequestController.js';

// joins first and last name into a display string
function fullName(first, last) {
  return [first, last].filter(Boolean).join(' ').trim() || 'Unknown';
}

// shapes a booking slot row for the student dashboard
function mapStudentRow(row) {
  const ownerName = fullName(row.owner_fn, row.owner_ln);
  const otherParty = {
    name: ownerName,
    email: row.owner_email,
  };
  const subject = row.slot_type === 'meeting_request'
    ? 'McGill Bookings — meeting request'
    : 'McGill Bookings — office hours';
  const mailtoUri = buildMailtoUri(
    row.owner_email,
    subject,
    `Hello,\n\nRegarding my booking on ${formatDateOnly(row.date)}.\n`
  );
  const booked = row.status === 'booked';
  return {
    slotId: row.id,
    date: formatDateOnly(row.date),
    startTime: String(row.start_time).slice(0, 8),
    endTime: String(row.end_time).slice(0, 8),
    status: row.status,
    slotType: row.slot_type,
    otherParty,
    mailtoUri,
    canCancel: booked,
  };
}

// shapes a booking slot row for the owner dashboard
function mapOwnerSlotRow(row) {
  const isGroupMeeting = row.slot_type === 'group_meeting';
  const booked = row.status === 'booked' && row.booked_by;
  let otherParty = null;
  let mailtoUri = null;

  if (isGroupMeeting) {
    // group meeting slots have no single booker — show the meeting title instead
    otherParty = { name: row.gm_title || 'Group Meeting', email: null };
  } else if (booked && row.booker_email) {
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
    slotType: row.slot_type,
    groupMeetingId: row.group_meeting_id || null,
    otherParty,
    mailtoUri,
    canCancel: Boolean(booked),
  };
}

// returns role aware dashboard data for the logged in user
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

  const [teamRows] = await pool.query(
    `SELECT tr.id, tr.course_code, tr.team_name, tr.description, tr.max_members, tr.is_open,
            tr.created_at, tr.creator_id,
            u.first_name AS creator_first_name, u.last_name AS creator_last_name,
            u.email AS creator_email,
            COUNT(tm.id) AS member_count,
            EXISTS (
              SELECT 1 FROM team_members tm2
              WHERE tm2.team_request_id = tr.id AND tm2.user_id = ?
            ) AS is_member
     FROM team_requests tr
     JOIN users u ON u.id = tr.creator_id
     LEFT JOIN team_members tm ON tm.team_request_id = tr.id
     WHERE tr.is_open = TRUE
     GROUP BY tr.id
     ORDER BY tr.created_at DESC
     LIMIT 20`,
    [userId]
  );
  const teamRequestsOpen = teamRows.map(mapTeamRequestListItem);

  if (isOwner) {
    const [slots] = await pool.query(
      `SELECT s.id, s.date, s.start_time, s.end_time, s.status, s.slot_type,
              s.booked_by, s.group_meeting_id,
              b.first_name AS booker_fn, b.last_name AS booker_ln, b.email AS booker_email,
              gm.title AS gm_title
       FROM booking_slots s
       LEFT JOIN users b ON s.booked_by = b.id
       LEFT JOIN group_meetings gm ON gm.id = s.group_meeting_id
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

    // group meetings the owner created that are still open for voting
    const [gmRows] = await pool.query(
      `SELECT gm.id, gm.title,
              gmo.id AS opt_id, gmo.date, gmo.start_time, gmo.end_time,
              COUNT(gmv.id) AS vote_count
       FROM group_meetings gm
       INNER JOIN group_meeting_options gmo ON gmo.group_meeting_id = gm.id
       LEFT JOIN group_meeting_votes gmv ON gmv.option_id = gmo.id
       WHERE gm.owner_id = ? AND gm.status = 'voting'
       GROUP BY gm.id, gm.title, gmo.id, gmo.date, gmo.start_time, gmo.end_time
       ORDER BY gm.id DESC, vote_count DESC, gmo.date ASC, gmo.start_time ASC`,
      [userId]
    );

    // group rows by meeting id
    const pollMap = new Map();
    for (const r of gmRows) {
      if (!pollMap.has(r.id)) {
        pollMap.set(r.id, { id: r.id, title: r.title || 'Group Meeting', options: [] });
      }
      pollMap.get(r.id).options.push({
        id: r.opt_id,
        date: formatDateOnly(r.date),
        startTime: String(r.start_time).slice(0, 5),
        endTime: String(r.end_time).slice(0, 5),
        voteCount: Number(r.vote_count),
      });
    }
    const groupPollsPending = Array.from(pollMap.values());

    sendOk(res, {
      isOwner: true,
      appointments: slots.map(mapOwnerSlotRow),
      meetingRequestsPending,
      groupPollsPending,
      teamRequestsOpen,
    });
    return;
  }

  // student: own booked slots plus group meeting slots where they are a listed participant
  const [slots] = await pool.query(
    `SELECT s.id, s.date, s.start_time, s.end_time, s.status, s.slot_type,
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

  // group meetings the student has been invited to (voting or finalized)
  // has_voted is 1 if the user cast any vote on any option in this meeting
  const [groupMeetingRows] = await pool.query(
    `SELECT gm.id, gm.title, gm.status,
            gm.finalized_date, gm.finalized_start, gm.finalized_end,
            gm.is_recurring, gm.recur_weeks,
            u.first_name AS owner_fn, u.last_name AS owner_ln, u.email AS owner_email,
            EXISTS (
              SELECT 1 FROM group_meeting_votes gmv
              INNER JOIN group_meeting_options gmo ON gmo.id = gmv.option_id
              WHERE gmo.group_meeting_id = gm.id AND gmv.user_id = ?
            ) AS has_voted
     FROM group_meetings gm
     INNER JOIN users u ON gm.owner_id = u.id
     INNER JOIN group_meeting_participants gmp ON gmp.group_meeting_id = gm.id
     WHERE gmp.user_id = ?
       AND gm.status IN ('voting', 'finalized')
       AND (
         gm.status = 'voting'
         OR TIMESTAMP(gm.finalized_date, gm.finalized_end) > NOW()
       )
     ORDER BY gm.id DESC`,
    [userId, userId]
  );

  const groupMeetings = groupMeetingRows.map((gm) => ({
    id: gm.id,
    title: gm.title || 'Group Meeting',
    status: gm.status,
    ownerName: fullName(gm.owner_fn, gm.owner_ln),
    ownerEmail: gm.owner_email,
    finalizedDate: gm.finalized_date ? formatDateOnly(gm.finalized_date) : null,
    finalizedStart: gm.finalized_start ? String(gm.finalized_start).slice(0, 5) : null,
    finalizedEnd: gm.finalized_end ? String(gm.finalized_end).slice(0, 5) : null,
    isRecurring: Boolean(gm.is_recurring),
    recurWeeks: gm.recur_weeks,
    hasVoted: Boolean(gm.has_voted),
  }));

  sendOk(res, {
    isOwner: false,
    appointments: slots.map(mapStudentRow),
    meetingRequestsPending: [],
    groupMeetings,
    teamRequestsOpen,
  });
});

// streams an ics calendar file of all booked appointments for the logged in user
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
