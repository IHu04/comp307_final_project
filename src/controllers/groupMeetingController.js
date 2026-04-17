import { DateTime } from 'luxon';
import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk, sendCreated } from '../utils/apiResponse.js';
import { buildMailtoUri } from '../utils/mailto.js';
import { formatDateOnly } from '../utils/dateSlot.js';
import {
  normalizeTime,
  timeToMinutes,
  isValidDateString,
  slotStartsInFuture,
} from '../utils/slotTime.js';
import { isMcGillStudentEmail } from '../utils/mcgillEmail.js';
import { ownerHasOverlappingSlot } from '../utils/slotOverlap.js';

function fullName(first, last) {
  return [first, last].filter(Boolean).join(' ').trim() || 'Unknown';
}

function mapMeetingRow(m) {
  return {
    id: m.id,
    ownerId: m.owner_id,
    title: m.title,
    status: m.status,
    isRecurring: Boolean(m.is_recurring),
    recurWeeks: m.recur_weeks,
    finalizedDate: m.finalized_date ? formatDateOnly(m.finalized_date) : null,
    finalizedStart: m.finalized_start ? String(m.finalized_start).slice(0, 8) : null,
    finalizedEnd: m.finalized_end ? String(m.finalized_end).slice(0, 8) : null,
    createdAt: m.created_at,
  };
}

export const createGroupMeeting = asyncHandler(async (req, res) => {
  const ownerId = req.session.userId;
  const title =
    req.body.title != null && String(req.body.title).trim() !== ''
      ? String(req.body.title).trim().slice(0, 255)
      : null;
  const optionsIn = req.body.options;
  const emailsIn = req.body.participantEmails;

  if (!Array.isArray(optionsIn) || optionsIn.length === 0) {
    return res.status(422).json({
      success: false,
      message: 'options must be a non-empty array',
    });
  }
  if (!Array.isArray(emailsIn)) {
    return res.status(422).json({
      success: false,
      message: 'participantEmails must be an array',
    });
  }

  const normalizedOptions = [];
  for (let i = 0; i < optionsIn.length; i++) {
    const o = optionsIn[i];
    const date = o?.date;
    const startTime = o?.startTime;
    const endTime = o?.endTime;
    if (!date || startTime == null || endTime == null) {
      return res.status(422).json({
        success: false,
        message: `options[${i}]: date, startTime, and endTime are required`,
      });
    }
    if (!isValidDateString(date)) {
      return res.status(422).json({
        success: false,
        message: `options[${i}]: invalid date`,
      });
    }
    const st = normalizeTime(startTime);
    const et = normalizeTime(endTime);
    if (timeToMinutes(et) <= timeToMinutes(st)) {
      return res.status(422).json({
        success: false,
        message: `options[${i}]: endTime must be after startTime`,
      });
    }
    normalizedOptions.push({ date, start: st, end: et });
  }

  const emailSet = new Set();
  const participantEmails = [];
  for (const raw of emailsIn) {
    const em = String(raw || '').trim().toLowerCase();
    if (!em) continue;
    if (!isMcGillStudentEmail(em)) {
      return res.status(422).json({
        success: false,
        message: `Invalid McGill email: ${em}`,
      });
    }
    if (!emailSet.has(em)) {
      emailSet.add(em);
      participantEmails.push(em);
    }
  }

  if (participantEmails.length === 0) {
    return res.status(422).json({
      success: false,
      message: 'Add at least one participant email',
    });
  }

  const [userRows] = await pool.query(
    `SELECT id, email FROM users WHERE LOWER(email) IN (${participantEmails.map(() => '?').join(',')})`,
    participantEmails
  );
  const foundByEmail = new Map(userRows.map((u) => [String(u.email).toLowerCase(), u.id]));
  const unknownEmails = participantEmails.filter((e) => !foundByEmail.has(e));
  // Skip unregistered emails with a warning rather than aborting the whole request.

  const participantUserIds = participantEmails
    .map((e) => foundByEmail.get(e))
    .filter((id) => id !== undefined && id !== ownerId);

  if (participantUserIds.length === 0) {
    return res.status(422).json({
      success: false,
      message:
        unknownEmails.length > 0
          ? 'None of the provided participant emails are registered. Participants must have an account before being invited.'
          : 'Add at least one participant other than yourself',
      ...(unknownEmails.length > 0 && { unknownEmails }),
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [gmIns] = await connection.query(
      `INSERT INTO group_meetings (owner_id, title, status)
       VALUES (?, ?, 'voting')`,
      [ownerId, title]
    );
    const meetingId = gmIns.insertId;

    for (const opt of normalizedOptions) {
      await connection.query(
        `INSERT INTO group_meeting_options (group_meeting_id, date, start_time, end_time, vote_count)
         VALUES (?, ?, ?, ?, 0)`,
        [meetingId, opt.date, opt.start, opt.end]
      );
    }

    for (const uid of participantUserIds) {
      await connection.query(
        `INSERT INTO group_meeting_participants (group_meeting_id, user_id)
         VALUES (?, ?)`,
        [meetingId, uid]
      );
    }

    await connection.commit();

    const meeting = await loadMeetingDetail(meetingId, ownerId);
    const toList = participantEmails.join(',');
    const notifyParticipantsMailto = buildMailtoUri(
      toList,
      `McGill Bookings — group meeting: ${title || 'Vote on a time'}`,
      `You are invited to vote on times for a group meeting.\nOpen the app and go to group meeting #${meetingId}.`
    );

    sendCreated(
      res,
      {
        meeting,
        notifyParticipantsMailto,
        ...(unknownEmails.length > 0 && { skippedEmails: unknownEmails }),
      },
      'Group meeting created'
    );
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
});

async function loadMeetingDetail(meetingId, currentUserId) {
  const [meetings] = await pool.query(
    `SELECT * FROM group_meetings WHERE id = ? LIMIT 1`,
    [meetingId]
  );
  const m = meetings[0];
  if (!m) return null;

  const [options] = await pool.query(
    `SELECT o.id, o.group_meeting_id, o.date, o.start_time, o.end_time,
            COUNT(v.id) AS vote_count,
            MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS current_user_voted
     FROM group_meeting_options o
     LEFT JOIN group_meeting_votes v ON v.option_id = o.id
     WHERE o.group_meeting_id = ?
     GROUP BY o.id
     ORDER BY o.date, o.start_time`,
    [currentUserId, meetingId]
  );

  const [participants] = await pool.query(
    `SELECT u.id, u.email, u.first_name, u.last_name
     FROM group_meeting_participants p
     INNER JOIN users u ON p.user_id = u.id
     WHERE p.group_meeting_id = ?
     ORDER BY u.last_name, u.first_name`,
    [meetingId]
  );

  return {
    ...mapMeetingRow(m),
    options: options.map((o) => ({
      id: o.id,
      date: formatDateOnly(o.date),
      startTime: String(o.start_time).slice(0, 8),
      endTime: String(o.end_time).slice(0, 8),
      voteCount: o.vote_count,
      currentUserVoted: Boolean(o.current_user_voted),
    })),
    participants: participants.map((p) => ({
      userId: p.id,
      email: p.email,
      firstName: p.first_name,
      lastName: p.last_name,
      name: fullName(p.first_name, p.last_name),
    })),
  };
}

export const getGroupMeeting = asyncHandler(async (req, res) => {
  const meetingId = req.params.id;
  const userId = req.session.userId;

  const detail = await loadMeetingDetail(meetingId, userId);
  if (!detail) {
    return res.status(404).json({ success: false, message: 'Meeting not found' });
  }

  sendOk(res, { meeting: detail });
});

export const voteOnGroupMeeting = asyncHandler(async (req, res) => {
  const meetingId = req.params.id;
  const userId = req.session.userId;
  const optionIds = req.body.optionIds;

  if (!Array.isArray(optionIds) || optionIds.length === 0) {
    return res.status(422).json({
      success: false,
      message: 'optionIds must be a non-empty array',
    });
  }

  const ids = [...new Set(optionIds.map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n) && n > 0))];
  if (ids.length === 0) {
    return res.status(422).json({
      success: false,
      message: 'optionIds must contain positive integers',
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [gm] = await connection.query(
      'SELECT id, status FROM group_meetings WHERE id = ? FOR UPDATE',
      [meetingId]
    );
    if (!gm.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }
    if (gm[0].status !== 'voting') {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Voting is closed for this meeting',
      });
    }

    const [opts] = await connection.query(
      `SELECT id FROM group_meeting_options
       WHERE group_meeting_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
      [meetingId, ...ids]
    );
    if (opts.length !== ids.length) {
      await connection.rollback();
      return res.status(422).json({
        success: false,
        message: 'One or more options do not belong to this meeting',
      });
    }

    // Replace this user's votes with the submitted set (upsert behaviour).
    // Delete existing votes for this meeting that are NOT in the new selection,
    // then insert any new ones — silently ignoring re-votes on already-selected options.
    await connection.query(
      `DELETE gmv FROM group_meeting_votes gmv
       INNER JOIN group_meeting_options gmo ON gmo.id = gmv.option_id
       WHERE gmo.group_meeting_id = ? AND gmv.user_id = ?
         AND gmv.option_id NOT IN (${ids.map(() => '?').join(',')})`,
      [meetingId, userId, ...ids]
    );

    for (const optId of ids) {
      // INSERT IGNORE skips already-existing votes without error.
      await connection.query(
        `INSERT IGNORE INTO group_meeting_votes (option_id, user_id) VALUES (?, ?)`,
        [optId, userId]
      );
    }

    await connection.commit();

    const meeting = await loadMeetingDetail(meetingId, userId);
    sendOk(res, { meeting }, 200, 'Votes recorded');
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
});

export const finalizeGroupMeeting = asyncHandler(async (req, res) => {
  const meetingId = req.params.id;
  const ownerId = req.session.userId;
  const selectedOptionId = parseInt(req.body.selectedOptionId, 10);
  const isRecurring = Boolean(req.body.isRecurring);
  let recurWeeks = parseInt(req.body.recurWeeks, 10);
  if (Number.isNaN(recurWeeks) || recurWeeks < 1) {
    recurWeeks = 1;
  }
  if (recurWeeks > 52) {
    recurWeeks = 52;
  }

  if (Number.isNaN(selectedOptionId) || selectedOptionId < 1) {
    return res.status(422).json({
      success: false,
      message: 'selectedOptionId is required',
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [gmRows] = await connection.query(
      `SELECT * FROM group_meetings WHERE id = ? AND owner_id = ? FOR UPDATE`,
      [meetingId, ownerId]
    );
    if (!gmRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Meeting not found' });
    }
    const gm = gmRows[0];
    if (gm.status !== 'voting') {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Meeting is not open for finalization',
      });
    }

    const [optRows] = await connection.query(
      `SELECT id, date, start_time, end_time
       FROM group_meeting_options
       WHERE id = ? AND group_meeting_id = ?`,
      [selectedOptionId, meetingId]
    );
    if (!optRows.length) {
      await connection.rollback();
      return res.status(422).json({
        success: false,
        message: 'Selected option not found on this meeting',
      });
    }
    const opt = optRows[0];
    const dateStr = formatDateOnly(opt.date);
    const st = normalizeTime(opt.start_time);
    const et = normalizeTime(opt.end_time);

    if (!slotStartsInFuture(dateStr, st)) {
      await connection.rollback();
      return res.status(422).json({
        success: false,
        message: 'The selected meeting time must be in the future',
      });
    }

    const weeksToCreate = isRecurring ? recurWeeks : 1;

    await connection.query(
      `UPDATE group_meetings SET
        status = 'finalized',
        is_recurring = ?,
        recur_weeks = ?,
        finalized_date = ?,
        finalized_start = ?,
        finalized_end = ?
       WHERE id = ?`,
      [isRecurring ? 1 : 0, weeksToCreate, dateStr, st, et, meetingId]
    );

    const base = DateTime.fromISO(dateStr, { zone: 'America/Montreal' });
    for (let w = 0; w < weeksToCreate; w++) {
      const d = base.plus({ weeks: w }).toISODate();
      if (await ownerHasOverlappingSlot(connection, ownerId, d, st, et)) {
        await connection.rollback();
        return res.status(422).json({
          success: false,
          message: `Finalized slot on ${d} would overlap an existing slot on your calendar`,
        });
      }
      await connection.query(
        `INSERT INTO booking_slots
          (owner_id, date, start_time, end_time, status, slot_type, group_meeting_id, booked_by, booked_at)
         VALUES (?, ?, ?, ?, 'booked', 'group_meeting', ?, NULL, NULL)`,
        [ownerId, d, st, et, meetingId]
      );
    }

    const [participants] = await connection.query(
      `SELECT u.email FROM group_meeting_participants p
       INNER JOIN users u ON p.user_id = u.id
       WHERE p.group_meeting_id = ?`,
      [meetingId]
    );

    await connection.commit();

    const emails = participants.map((p) => p.email).filter(Boolean);
    const toList = emails.join(',');
    const notifyParticipantsMailto = buildMailtoUri(
      toList,
      `McGill Bookings — group meeting finalized: ${gm.title || 'Meeting'}`,
      `The organizer picked ${dateStr} from ${String(st).slice(0, 5)} to ${String(et).slice(0, 5)}${isRecurring ? ` (${weeksToCreate} week(s))` : ''}.\nSee your dashboard for details.`
    );

    const meeting = await loadMeetingDetail(meetingId, ownerId);
    sendOk(
      res,
      {
        meeting,
        notifyParticipantsMailto,
      },
      200,
      'Meeting finalized'
    );
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
});

/** DELETE /api/group-meetings/:id/vote — remove all of the current user's votes */
export const retractVote = asyncHandler(async (req, res) => {
  const meetingId = req.params.id;
  const userId = req.session.userId;

  const [gm] = await pool.query(
    'SELECT id, status FROM group_meetings WHERE id = ? LIMIT 1',
    [meetingId]
  );
  if (!gm.length) {
    return res.status(404).json({ success: false, message: 'Meeting not found' });
  }
  if (gm[0].status !== 'voting') {
    return res.status(409).json({
      success: false,
      message: 'Voting is closed for this meeting',
    });
  }

  await pool.query(
    `DELETE gmv FROM group_meeting_votes gmv
     INNER JOIN group_meeting_options gmo ON gmo.id = gmv.option_id
     WHERE gmo.group_meeting_id = ? AND gmv.user_id = ?`,
    [meetingId, userId]
  );

  const meeting = await loadMeetingDetail(meetingId, userId);
  sendOk(res, { meeting }, 200, 'Votes retracted');
});
