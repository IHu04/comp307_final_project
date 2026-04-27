// student sends a meeting request to an owner, owner accepts or declines
import { Router } from 'express';
import { body, param } from 'express-validator';
import { isAuthenticated, isOwner, isResourceOwner } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createMeetingRequest,
  listReceivedRequests,
  listSentRequests,
  updateMeetingRequest,
} from '../controllers/meetingRequestController.js';

const router = Router();

const idParam = param('id').isInt({ min: 1 }).withMessage('id must be a positive integer');

// student provides the owner id and an optional message
const createBody = [
  body('ownerId').isInt({ min: 1 }).withMessage('ownerId must be a positive integer'),
  body('message').optional({ values: 'null' }).isString().isLength({ max: 5000 }),
];

// owner responds with accepted or declined, date and time only required when accepting
const patchMeetingRequestRules = [
  idParam,
  body('status').isIn(['accepted', 'declined']).withMessage('status must be accepted or declined'),
  body('date').optional().isString(),
  body('startTime').optional().isString(),
  body('endTime').optional().isString(),
];

router.post('/', isAuthenticated, createBody, validate, createMeetingRequest);
router.get('/received', isAuthenticated, isOwner, listReceivedRequests);
router.get('/sent', isAuthenticated, listSentRequests);
router.patch(
  '/:id',
  isAuthenticated,
  isOwner,
  patchMeetingRequestRules,
  validate,
  isResourceOwner('meeting_requests', 'id'),
  updateMeetingRequest
);

export default router;
