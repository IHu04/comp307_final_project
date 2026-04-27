// profile read and update for the logged in user
import { Router } from 'express';
import { body } from 'express-validator';
import { isAuthenticated } from '../middleware/auth.js';
import { validate, validatePassword } from '../middleware/validate.js';
import {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
} from '../controllers/userController.js';

const router = Router();

// both names required and capped at 100 chars
const updateProfileRules = [
  body('firstName').trim().notEmpty().isLength({ max: 100 }),
  body('lastName').trim().notEmpty().isLength({ max: 100 }),
];

// old password required before a new one is accepted
const changePasswordRules = [
  body('oldPassword').notEmpty().withMessage('oldPassword is required'),
  validatePassword('newPassword'),
];

router.get('/me', isAuthenticated, getMyProfile);
router.put('/me', isAuthenticated, updateProfileRules, validate, updateMyProfile);
router.put('/me/password', isAuthenticated, changePasswordRules, validate, changeMyPassword);

export default router;
