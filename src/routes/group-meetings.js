import { Router } from 'express';
import { body, param } from 'express-validator';
import { isAuthenticated, isOwner, isResourceOwner } from '../middleware/auth.js';
import {
  canViewGroupMeeting,
  isGroupMeetingParticipant,
} from '../middleware/groupMeetingAccess.js';
import { validate } from '../middleware/validate.js';
import {
  createGroupMeeting,
  getGroupMeeting,
  voteOnGroupMeeting,
  retractVote,
  finalizeGroupMeeting,
  cancelGroupMeeting,
} from '../controllers/groupMeetingController.js';

const router = Router();

const meetingIdParam = param('id').isInt({ min: 1 }).withMessage('id must be a positive integer');

const createRules = [
  body('title').optional({ values: 'null' }).isString().isLength({ max: 255 }),
  body('options').isArray({ min: 1 }),
  body('options.*.date').isString(),
  body('options.*.startTime').isString(),
  body('options.*.endTime').isString(),
  body('participantEmails').isArray({ min: 1 }),
];

const voteRules = [
  meetingIdParam,
  body('optionIds').isArray({ min: 1 }),
  body('optionIds.*').isInt({ min: 1 }),
];

const finalizeRules = [
  meetingIdParam,
  body('selectedOptionId').isInt({ min: 1 }),
  body('isRecurring').optional().isBoolean(),
  body('recurWeeks').optional().isInt({ min: 1, max: 52 }),
];

router.post('/', isAuthenticated, isOwner, createRules, validate, createGroupMeeting);
router.get('/:id', isAuthenticated, meetingIdParam, validate, canViewGroupMeeting, getGroupMeeting);
router.post(
  '/:id/vote',
  isAuthenticated,
  voteRules,
  validate,
  isGroupMeetingParticipant,
  voteOnGroupMeeting
);
router.delete(
  '/:id/vote',
  isAuthenticated,
  meetingIdParam,
  validate,
  isGroupMeetingParticipant,
  retractVote
);
router.patch(
  '/:id/finalize',
  isAuthenticated,
  isOwner,
  finalizeRules,
  validate,
  isResourceOwner('group_meetings', 'id'),
  finalizeGroupMeeting
);
router.delete(
  '/:id',
  isAuthenticated,
  isOwner,
  meetingIdParam,
  validate,
  isResourceOwner('group_meetings', 'id'),
  cancelGroupMeeting
);

export default router;
