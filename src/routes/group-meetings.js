// group meeting polls, owner creates and finalizes, participants vote
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

// owner provides a title, one or more time options, and participant emails
const createRules = [
  body('title').optional({ values: 'null' }).isString().isLength({ max: 255 }),
  body('options').isArray({ min: 1 }),
  body('options.*.date').isString(),
  body('options.*.startTime').isString(),
  body('options.*.endTime').isString(),
  body('participantEmails').isArray({ min: 1 }),
];

// participant submits one or more option ids to vote on
const voteRules = [
  meetingIdParam,
  body('optionIds').isArray({ min: 1 }),
  body('optionIds.*').isInt({ min: 1 }),
];

// owner picks the winning option and optionally marks it recurring
const finalizeRules = [
  meetingIdParam,
  body('selectedOptionId').isInt({ min: 1 }),
  body('isRecurring').optional().isBoolean(),
  body('recurWeeks').optional().isInt({ min: 1, max: 52 }),
];

router.post('/', isAuthenticated, isOwner, createRules, validate, createGroupMeeting);

// view requires being the owner or a listed participant
router.get('/:id', isAuthenticated, meetingIdParam, validate, canViewGroupMeeting, getGroupMeeting);

router.post('/:id/vote', isAuthenticated, voteRules, validate, isGroupMeetingParticipant, voteOnGroupMeeting);
router.delete('/:id/vote', isAuthenticated, meetingIdParam, validate, isGroupMeetingParticipant, retractVote);

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
