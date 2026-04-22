// /api/bookings: legacy bookings list plus delete on booking_slots via nested path
import { Router } from 'express';
import { param } from 'express-validator';
import { listBookings } from '../controllers/bookingController.js';
import { cancelMySlotBooking } from '../controllers/slotBookController.js';
import { validate } from '../middleware/validate.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = Router();

const slotIdMustBeNumber = param('slotId')
  .isInt({ min: 1 })
  .withMessage('slotId must be a positive integer');

// paginated rows from the old bookings table
router.get('/', isAuthenticated, listBookings);

// cancel a booking_slots row and set the slot back to active
router.delete('/slots/:slotId', isAuthenticated, slotIdMustBeNumber, validate, cancelMySlotBooking);

export default router;
