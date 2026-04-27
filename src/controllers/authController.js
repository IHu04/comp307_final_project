// register, login, logout, session helpers, password change
// on login or register: regenerate session to avoid fixation, then store user id
// on logout: destroy session and clear the cookie
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk, sendCreated } from '../utils/apiResponse.js';
import { isOwnerEmail } from '../utils/mcgillEmail.js';
import { toPublicUser } from '../utils/userPublic.js';
import { SESSION_COOKIE_NAME } from '../config/session.js';
import env from '../config/env.js';

const BCRYPT_ROUNDS = 12;

// wraps session.regenerate in a promise so it can be awaited
function sessionRegenerate(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

// wraps session.save in a promise so it can be awaited
function sessionSave(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

// fetches a full user row by id
export async function fetchUserById(id) {
  const [rows] = await pool.query(
    `SELECT id, email, first_name, last_name, is_owner, invite_token, created_at, updated_at
     FROM users WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

// creates a new user, hashes their password, and starts a session
export const register = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = req.body.password;
  const firstName = String(req.body.firstName || '').trim();
  const lastName = String(req.body.lastName || '').trim();

  const isOwner = isOwnerEmail(email);
  // owners get an invite token so they can share a direct booking link
  const inviteToken = isOwner ? randomUUID() : null;
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  let insertId;
  try {
    const [result] = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_owner, invite_token)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [email, passwordHash, firstName, lastName, isOwner, inviteToken]
    );
    insertId = result.insertId;
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Email already registered',
      });
    }
    throw e;
  }

  await sessionRegenerate(req);
  req.session.userId = insertId;
  await sessionSave(req);

  const user = await fetchUserById(insertId);
  sendCreated(res, { user: toPublicUser(user) }, 'Registered');
});

// verifies credentials and starts a session
export const login = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = req.body.password;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password required',
    });
  }

  const [rows] = await pool.query(
    'SELECT id, password_hash FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  const row = rows[0];
  // same message for missing user and wrong password to avoid enumeration
  const bad = { success: false, message: 'Invalid email or password' };

  if (!row) return res.status(401).json(bad);

  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) return res.status(401).json(bad);

  await sessionRegenerate(req);
  req.session.userId = row.id;
  await sessionSave(req);

  const user = await fetchUserById(row.id);
  sendOk(res, { user: toPublicUser(user) }, 200, 'Logged in');
});

// destroys the session and clears the cookie
export function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: env.nodeEnv === 'production',
    });
    res.status(200).json({ success: true, message: 'Logged out' });
  });
}

// verifies the current password then stores a new hash
export const changePassword = asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  const currentPassword = req.body.currentPassword;
  const newPassword = req.body.newPassword;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'currentPassword and newPassword are required',
    });
  }

  if (newPassword.length < 8) {
    return res.status(422).json({
      success: false,
      message: 'New password must be at least 8 characters',
    });
  }

  const [rows] = await pool.query(
    'SELECT id, password_hash FROM users WHERE id = ? LIMIT 1',
    [userId]
  );

  if (!rows.length) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  const match = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);

  sendOk(res, {}, 200, 'Password updated');
});

// returns the currently logged in user
export const me = asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  const user = await fetchUserById(userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  sendOk(res, { user: toPublicUser(user) });
});
