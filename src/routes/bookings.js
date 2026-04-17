import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  listBookings,
  getBooking,
  createBooking,
  updateBooking,
  deleteBooking,
} from '../controllers/bookingController.js';
import { cancelMySlotBooking } from '../controllers/slotBookController.js';
import { validate } from '../middleware/validate.js';
import { isAuthenticated } from '../middleware/auth.js';
import { isMcGillStudentEmail } from '../utils/mcgillEmail.js';

const router = Router();

const idMustBeNumber = param('id').isInt({ min: 1 }).withMessage('id should be a positive number');
const slotIdMustBeNumber = param('slotId')
  .isInt({ min: 1 })
  .withMessage('slotId should be a positive number');

// Same checks for POST (create) and PUT (replace whole booking)
const bookingFields = [
  body('student_email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email')
    .custom(isMcGillStudentEmail)
    .withMessage('Use your @mcgill.ca or @mail.mcgill.ca email'),
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 200 })
    .withMessage('Title is too long (max 200 characters)'),
  body('description')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description is too long (max 500 characters)'),
  body('appointment_at')
    .notEmpty()
    .withMessage('appointment_at is required (when is the slot?)')
    .isISO8601()
    .withMessage('Use an ISO date/time string, e.g. 2026-04-15T14:00:00.000Z'),
  body('duration_minutes')
    .optional()
    .isInt({ min: 5, max: 480 })
    .withMessage('duration_minutes should be between 5 and 480'),
  body('status')
    .optional()
    .isIn(['pending', 'confirmed', 'cancelled'])
    .withMessage('status must be pending, confirmed, or cancelled'),
];

router.get('/', isAuthenticated, listBookings);

// Cancel a booking_slots reservation (not the legacy bookings table)
router.delete(
  '/slots/:slotId',
  isAuthenticated,
  slotIdMustBeNumber,
  validate,
  cancelMySlotBooking
);

router.get('/:id', isAuthenticated, idMustBeNumber, validate, getBooking);
router.post('/', isAuthenticated, bookingFields, validate, createBooking);
router.put('/:id', isAuthenticated, [idMustBeNumber, ...bookingFields], validate, updateBooking);
router.delete('/:id', isAuthenticated, idMustBeNumber, validate, deleteBooking);

export default router;
