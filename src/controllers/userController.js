// profile and password change for the logged in user
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import { toPublicUser } from '../utils/userPublic.js';
import { fetchUserById } from './authController.js';

const BCRYPT_ROUNDS = 12;

// returns the logged in user's profile
export const getMyProfile = asyncHandler(async (req, res) => {
  const user = await fetchUserById(req.session.userId);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  sendOk(res, { user: toPublicUser(user) });
});

// updates first and last name for the logged in user
export const updateMyProfile = asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const firstName = String(req.body.firstName || '').trim().slice(0, 100);
  const lastName = String(req.body.lastName || '').trim().slice(0, 100);

  await pool.query(
    'UPDATE users SET first_name = ?, last_name = ? WHERE id = ?',
    [firstName, lastName, userId]
  );

  const user = await fetchUserById(userId);
  sendOk(res, { user: toPublicUser(user) }, 200, 'Profile updated');
});

// verifies the old password then saves a new hash
export const changeMyPassword = asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const oldPassword = req.body.oldPassword;
  const newPassword = req.body.newPassword;

  const [rows] = await pool.query(
    'SELECT id, password_hash FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  if (!rows.length) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  const match = await bcrypt.compare(String(oldPassword), rows[0].password_hash);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }

  const passwordHash = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);

  sendOk(res, { updated: true }, 200, 'Password changed');
});
