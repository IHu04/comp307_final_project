import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth.js';
import { getDashboard } from '../controllers/dashboardController.js';

const router = Router();

router.get('/', isAuthenticated, getDashboard);

export default router;
