import { body, param } from 'express-validator';
import { validationResult } from 'express-validator';
import { isMcGillStudentEmail } from '../utils/mcgillEmail.js';
import { isValidDateString } from '../utils/slotTime.js';
import { normalizeTime } from '../utils/slotTime.js';

/** McGill registration/login email: @mcgill.ca or @mail.mcgill.ca */
export function validateEmail(field = 'email') {
  return body(field)
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Valid email required')
    .custom(isMcGillStudentEmail)
    .withMessage('Email must be @mcgill.ca or @mail.mcgill.ca');
}

/** Minimum length 8 (registration / password change). */
export function validatePassword(field = 'password') {
  return body(field).isLength({ min: 8 }).withMessage('Password must be at least 8 characters');
}

/** Calendar date YYYY-MM-DD */
export function validateDate(field = 'date') {
  return body(field)
    .trim()
    .notEmpty()
    .withMessage(`${field} is required`)
    .custom((v) => isValidDateString(v))
    .withMessage(`${field} must be YYYY-MM-DD`);
}

/** Time HH:MM or HH:MM:SS (stored normalized in handlers). */
export function validateTime(field = 'startTime') {
  return body(field).custom((v) => {
    if (v == null || String(v).trim() === '') {
      throw new Error(`${field} is required`);
    }
    const s = String(v).trim();
    if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
      throw new Error(`${field} must be a time like HH:MM or HH:MM:SS`);
    }
    const n = normalizeTime(s);
    if (!/^\d{2}:\d{2}:\d{2}$/.test(n)) {
      throw new Error(`${field} is not a valid time`);
    }
    return true;
  });
}

/** Positive integer in route param (default field `id`). */
export function validateId(field = 'id', source = 'param') {
  const chain = source === 'body' ? body(field) : param(field);
  return chain
    .isInt({ min: 1 })
    .withMessage(`${field} must be a positive integer`);
}

export function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      details: result.array(),
    });
  }
  next();
}
