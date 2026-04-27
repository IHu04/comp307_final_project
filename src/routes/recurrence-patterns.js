// weekly recurring office hour patterns that generate draft slots in bulk
import { Router } from 'express';
import { body } from 'express-validator';
import { isAuthenticated, isOwner, isResourceOwner } from '../middleware/auth.js';
import { validate, validateDate, validateId } from '../middleware/validate.js';
import {
  createRecurrencePatterns,
  listMyRecurrencePatterns,
  deleteRecurrencePattern,
} from '../controllers/recurrenceController.js';

const router = Router();

// owner provides a start date, how many weeks, and one or more day and time patterns
const createRules = [
  validateDate('startDate'),
  body('numWeeks').isInt({ min: 1, max: 52 }),
  body('patterns').isArray({ min: 1 }),
  body('patterns.*.dayOfWeek').isInt({ min: 0, max: 6 }),
  body('patterns.*.startTime').isString(),
  body('patterns.*.endTime').isString(),
];

router.get('/mine', isAuthenticated, isOwner, listMyRecurrencePatterns);
router.post('/', isAuthenticated, isOwner, createRules, validate, createRecurrencePatterns);
router.delete(
  '/:id',
  isAuthenticated,
  isOwner,
  validateId('id'),
  validate,
  isResourceOwner('recurrence_patterns', 'id'),
  deleteRecurrencePattern
);

export default router;
