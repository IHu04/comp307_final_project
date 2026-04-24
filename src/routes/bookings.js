// legacy bookings list and cancel booking_slots via nested path
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

// returns paginated rows from the legacy bookings table
router.get('/', isAuthenticated, listBookings);

// cancels a booking_slots row and sets the slot back to active
router.delete('/slots/:slotId', isAuthenticated, slotIdMustBeNumber, validate, cancelMySlotBooking);

export default router;
