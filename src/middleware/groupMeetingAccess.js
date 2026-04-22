import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// meeting exists and user is owner or listed participant
export const canViewGroupMeeting = asyncHandler(async (req, res, next) => {
  const userId = req.session.userId;
  const meetingId = req.params.id;

  const [meetings] = await pool.query(
    'SELECT id, owner_id FROM group_meetings WHERE id = ? LIMIT 1',
    [meetingId]
  );
  if (!meetings.length) {
    return res.status(404).json({ success: false, message: 'Meeting not found' });
  }

  if (meetings[0].owner_id === userId) {
    return next();
  }

  const [parts] = await pool.query(
    `SELECT 1 FROM group_meeting_participants
     WHERE group_meeting_id = ? AND user_id = ? LIMIT 1`,
    [meetingId, userId]
  );
  if (!parts.length) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  next();
});

export const isGroupMeetingParticipant = asyncHandler(async (req, res, next) => {
  const userId = req.session.userId;
  const meetingId = req.params.id;

  const [rows] = await pool.query(
    `SELECT 1 FROM group_meeting_participants
     WHERE group_meeting_id = ? AND user_id = ? LIMIT 1`,
    [meetingId, userId]
  );
  if (!rows.length) {
    return res.status(403).json({
      success: false,
      message: 'You are not a participant in this meeting',
    });
  }
  next();
});
