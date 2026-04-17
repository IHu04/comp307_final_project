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

const idParam = validateId('id');
const userIdParam = validateId('userId');

const createRules = [
  body('courseCode').trim().notEmpty().isLength({ max: 20 }),
  body('teamName').trim().notEmpty().isLength({ max: 100 }),
  body('description').optional({ values: 'null' }).isString(),
  body('maxMembers').optional().isInt({ min: 1, max: 100 }),
];

const listQuery = [
  query('courseCode').optional().isString().isLength({ max: 20 }),
];

router.post('/', isAuthenticated, createRules, validate, createTeamRequest);
router.get('/', isAuthenticated, listQuery, validate, listTeamRequests);

router.post('/:id/join', isAuthenticated, idParam, validate, joinTeamRequest);
router.delete('/:id/leave', isAuthenticated, idParam, validate, leaveTeamRequest);
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
router.delete(
  '/:id',
  isAuthenticated,
  idParam,
  validate,
  isResourceOwner('team_requests', 'id'),
  deleteTeamRequest
);

export default router;
