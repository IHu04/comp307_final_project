// shared express-validator chains; call validate() last in the route to return 422 with details
import { body, param, validationResult } from 'express-validator';
import { isMcGillStudentEmail } from '../utils/mcgillEmail.js';
import { isValidDateString, normalizeTime } from '../utils/slotTime.js';

// email must be @mcgill.ca or @mail.mcgill.ca
export function validateEmail(field = 'email') {
  return body(field)
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Valid email required')
    .custom(isMcGillStudentEmail).withMessage('Email must be @mcgill.ca or @mail.mcgill.ca');
}

// password at least 8 chars for register or password change
export function validatePassword(field = 'password') {
  return body(field)
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters');
}

// calendar date as yyyy-mm-dd
export function validateDate(field = 'date') {
  return body(field)
    .trim()
    .notEmpty().withMessage(`${field} is required`)
    .custom((v) => isValidDateString(v)).withMessage(`${field} must be YYYY-MM-DD`);
}

// time as hh:mm or hh:mm:ss, normalized to hh:mm:ss for mysql
export function validateTime(field = 'startTime') {
  return body(field).custom((v) => {
    if (v == null || String(v).trim() === '') throw new Error(`${field} is required`);
    const s = String(v).trim();
    if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
      throw new Error(`${field} must be a time like HH:MM or HH:MM:SS`);
    }
    const n = normalizeTime(s);
    if (!/^\d{2}:\d{2}:\d{2}$/.test(n)) throw new Error(`${field} is not a valid time`);
    return true;
  });
}

// positive integer route or body field, default param name id
export function validateId(field = 'id', source = 'param') {
  const chain = source === 'body' ? body(field) : param(field);
  return chain
    .isInt({ min: 1 })
    .withMessage(`${field} must be a positive integer`);
}

// after all chains: respond 422 with validation errors if any failed
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
