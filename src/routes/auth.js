import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, logout, me, changePassword } from '../controllers/authController.js';
import { validate, validateEmail, validatePassword } from '../middleware/validate.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = Router();

const registerRules = [
  validateEmail('email'),
  validatePassword('password'),
  body('firstName').trim().notEmpty().withMessage('firstName is required'),
  body('lastName').trim().notEmpty().withMessage('lastName is required'),
];

const loginRules = [
  validateEmail('email'),
  body('password').notEmpty().withMessage('password is required'),
];

router.post('/register', registerRules, validate, register);
router.post('/login', loginRules, validate, login);
router.post('/logout', isAuthenticated, logout);
router.get('/me', isAuthenticated, me);
router.patch('/password', isAuthenticated, changePassword);

export default router;
