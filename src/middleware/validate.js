// shared express-validator chains, call validate() last in the route to return 422 with details
import { body, param, validationResult } from 'express-validator';
import { isMcGillStudentEmail } from '../utils/mcgillEmail.js';
import { isValidDateString } from '../utils/slotTime.js';

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

// positive integer route or body field, default param name id
export function validateId(field = 'id', source = 'param') {
  const chain = source === 'body' ? body(field) : param(field);
  return chain
    .isInt({ min: 1 })
    .withMessage(`${field} must be a positive integer`);
}

// after all chains, respond 422 with validation errors if any failed
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
