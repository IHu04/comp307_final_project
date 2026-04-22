import { Router } from 'express';
import { body } from 'express-validator';
import { isAuthenticated, isOwner, isResourceOwner } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createSlots,
  listMySlots,
  bulkActivateSlots,
  activateSlot,
  deactivateSlot,
  deleteSlot,
  getSlotMailto,
} from '../controllers/slotController.js';
import { bookSlot, cancelMySlotBooking } from '../controllers/slotBookController.js';

const router = Router();

const ownerOnly = [isAuthenticated, isOwner];
const ownerAndSlot = [
  isAuthenticated,
  isOwner,
  isResourceOwner('booking_slots', 'id'),
];

// register /mine before /:id so "mine" is not parsed as an id
router.get('/mine', ...ownerOnly, listMySlots);
router.post('/', ...ownerOnly, createSlots);

const bulkActivateRules = [
  body('slotIds').isArray({ min: 1 }),
  body('slotIds.*').isInt({ min: 1 }),
];
router.patch(
  '/bulk-activate',
  ...ownerOnly,
  bulkActivateRules,
  validate,
  bulkActivateSlots
);

router.post('/:id/book', isAuthenticated, bookSlot);
router.delete('/:slotId/book', isAuthenticated, cancelMySlotBooking);

router.get('/:id/mailto', ...ownerAndSlot, getSlotMailto);
router.patch('/:id/activate', ...ownerAndSlot, activateSlot);
router.patch('/:id/deactivate', ...ownerAndSlot, deactivateSlot);
router.delete('/:id', ...ownerAndSlot, deleteSlot);

export default router;
