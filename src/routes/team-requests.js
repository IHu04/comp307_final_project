// teamfinder listings, students create and join open teams by course code
import { Router } from 'express';
import { body, query } from 'express-validator';
import { isAuthenticated, isResourceOwner } from '../middleware/auth.js';
import { validate, validateId } from '../middleware/validate.js';
import {
  createTeamRequest,
  listTeamRequests,
  getTeamRequest,
  joinTeamRequest,
  leaveTeamRequest,
  removeTeamMember,
  deleteTeamRequest,
} from '../controllers/teamRequestController.js';

const router = Router();

// reusable id validators for the team and a specific member
const idParam = validateId('id');
const userIdParam = validateId('userId');

// required fields when creating a new team listing
const createRules = [
  body('courseCode').trim().notEmpty().isLength({ max: 20 }),
  body('teamName').trim().notEmpty().isLength({ max: 100 }),
  body('description').optional({ values: 'null' }).isString(),
  body('maxMembers').optional().isInt({ min: 1, max: 100 }),
];

// optional course code filter when listing open teams
const listQuery = [
  query('courseCode').optional().isString().isLength({ max: 20 }),
];

router.post('/', isAuthenticated, createRules, validate, createTeamRequest);
router.get('/', isAuthenticated, listQuery, validate, listTeamRequests);

router.post('/:id/join', isAuthenticated, idParam, validate, joinTeamRequest);
router.delete('/:id/leave', isAuthenticated, idParam, validate, leaveTeamRequest);

// only the team creator can kick a member
router.delete(
  '/:id/members/:userId',
  isAuthenticated,
  idParam,
  userIdParam,
  validate,
  isResourceOwner('team_requests', 'id'),
  removeTeamMember
);

router.get('/:id', isAuthenticated, idParam, validate, getTeamRequest);

// only the creator can delete the whole listing
router.delete(
  '/:id',
  isAuthenticated,
  idParam,
  validate,
  isResourceOwner('team_requests', 'id'),
  deleteTeamRequest
);

export default router;
