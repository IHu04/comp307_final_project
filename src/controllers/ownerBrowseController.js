import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import { formatDateOnly } from '../utils/dateSlot.js';

function mapPublicSlot(row) {
  return {
    id: row.id,
    date: formatDateOnly(row.date),
    startTime: String(row.start_time).slice(0, 8),
    endTime: String(row.end_time).slice(0, 8),
  };
}

export const listOwnersWithActiveSlots = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email,
            COUNT(bs.id) AS active_slot_count
     FROM users u
     INNER JOIN booking_slots bs
       ON bs.owner_id = u.id AND bs.status = 'active'
     WHERE u.is_owner = 1
     GROUP BY u.id, u.first_name, u.last_name, u.email
     HAVING COUNT(bs.id) > 0
     ORDER BY u.last_name, u.first_name`
  );

  const owners = rows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    activeSlotCount: Number(r.active_slot_count),
  }));

  sendOk(res, { owners });
});

export const listOwnerActiveSlots = asyncHandler(async (req, res) => {
  const ownerId = req.params.id;

  const [users] = await pool.query(
    'SELECT id, is_owner FROM users WHERE id = ? LIMIT 1',
    [ownerId]
  );
  if (!users.length || !users[0].is_owner) {
    return res.status(404).json({ success: false, message: 'Owner not found' });
  }

  const [slots] = await pool.query(
    `SELECT id, date, start_time, end_time
     FROM booking_slots
     WHERE owner_id = ?
       AND status = 'active'
       AND TIMESTAMP(date, end_time) > NOW()
     ORDER BY date ASC, start_time ASC`,
    [ownerId]
  );

  sendOk(res, { slots: slots.map(mapPublicSlot) });
});

export const inviteByToken = asyncHandler(async (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token) {
    return res.status(404).json({ success: false, message: 'Invalid invite' });
  }

  const [users] = await pool.query(
    `SELECT id, first_name, last_name, email
     FROM users
     WHERE invite_token = ? AND is_owner = 1
     LIMIT 1`,
    [token]
  );

  if (!users.length) {
    return res.status(404).json({ success: false, message: 'Invite not found' });
  }

  const owner = users[0];
  const [slots] = await pool.query(
    `SELECT id, date, start_time, end_time
     FROM booking_slots
     WHERE owner_id = ?
       AND status = 'active'
       AND TIMESTAMP(date, end_time) > NOW()
     ORDER BY date ASC, start_time ASC`,
    [owner.id]
  );

  sendOk(res, {
    owner: {
      id: owner.id,
      firstName: owner.first_name,
      lastName: owner.last_name,
      email: owner.email,
    },
    slots: slots.map(mapPublicSlot),
  });
});
