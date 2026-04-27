// ics calendar export for all booked appointments of the logged in user
import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth.js';
import { exportAppointmentsIcs } from '../controllers/dashboardController.js';

const router = Router();

router.get('/export', isAuthenticated, exportAppointmentsIcs);

export default router;
