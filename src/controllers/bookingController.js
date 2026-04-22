// crud for the legacy bookings table (older schema alongside booking_slots)
import { pool } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendOk, sendCreated } from '../utils/apiResponse.js';

export const listBookings = asyncHandler(async (req, res) => {
  let page = parseInt(req.query.page, 10);
  if (Number.isNaN(page) || page < 1) {
    page = 1;
  }
  let limit = parseInt(req.query.limit, 10);
  if (Number.isNaN(limit) || limit < 1) {
    limit = 20;
  }
  if (limit > 100) {
    limit = 100;
  }
  const skip = (page - 1) * limit;

  const [list] = await pool.query(
    `SELECT id, student_email, title, description, appointment_at, duration_minutes,
            status, created_at, updated_at
     FROM bookings
     ORDER BY appointment_at DESC
     LIMIT ? OFFSET ?`,
    [limit, skip]
  );

  const [countResult] = await pool.query('SELECT COUNT(*) AS n FROM bookings');
  const total = Number(countResult[0].n);

  sendOk(res, { bookings: list, total, page, limit });
});

export const getBooking = asyncHandler(async (req, res) => {
  const bookingId = req.params.id;
  const [rows] = await pool.query(
    `SELECT id, student_email, title, description, appointment_at, duration_minutes,
            status, created_at, updated_at
     FROM bookings WHERE id = ?`,
    [bookingId]
  );
  if (rows.length === 0) {
    const e = new Error('No booking with that id');
    e.statusCode = 404;
    throw e;
  }
  sendOk(res, { booking: rows[0] });
});

export const createBooking = asyncHandler(async (req, res) => {
  const email = req.body.student_email;
  const title = req.body.title;
  const description = req.body.description ?? null;
  const when = new Date(req.body.appointment_at);
  const duration = req.body.duration_minutes ?? 30;
  const status = req.body.status ?? 'pending';

  const [insertResult] = await pool.query(
    `INSERT INTO bookings
      (student_email, title, description, appointment_at, duration_minutes, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [email, title, description, when, duration, status]
  );

  const newId = insertResult.insertId;
  const [rows] = await pool.query(
    `SELECT id, student_email, title, description, appointment_at, duration_minutes,
            status, created_at, updated_at
     FROM bookings WHERE id = ?`,
    [newId]
  );
  sendCreated(res, { booking: rows[0] }, 'Booking created');
});

export const updateBooking = asyncHandler(async (req, res) => {
  const bookingId = req.params.id;
  const email = req.body.student_email;
  const title = req.body.title;
  const description = req.body.description ?? null;
  const when = new Date(req.body.appointment_at);
  const duration = req.body.duration_minutes ?? 30;
  const status = req.body.status ?? 'pending';

  const [updateResult] = await pool.query(
    `UPDATE bookings SET
      student_email = ?, title = ?, description = ?, appointment_at = ?,
      duration_minutes = ?, status = ?
     WHERE id = ?`,
    [email, title, description, when, duration, status, bookingId]
  );

  if (updateResult.affectedRows === 0) {
    const e = new Error('No booking with that id');
    e.statusCode = 404;
    throw e;
  }

  const [rows] = await pool.query(
    `SELECT id, student_email, title, description, appointment_at, duration_minutes,
            status, created_at, updated_at
     FROM bookings WHERE id = ?`,
    [bookingId]
  );
  sendOk(res, { booking: rows[0] }, 200, 'Booking updated');
});

export const deleteBooking = asyncHandler(async (req, res) => {
  const bookingId = req.params.id;
  const [delResult] = await pool.query('DELETE FROM bookings WHERE id = ?', [bookingId]);
  if (delResult.affectedRows === 0) {
    const e = new Error('No booking with that id');
    e.statusCode = 404;
    throw e;
  }
  sendOk(res, {}, 200, 'Booking deleted');
});
