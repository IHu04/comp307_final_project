import { Router } from 'express';
import bookingsRoutes from './bookings.js';
import authRoutes from './auth.js';
import usersRoutes from './users.js';
import slotsRoutes from './slots.js';
import ownersRoutes from './owners.js';
import inviteRoutes from './invite.js';
import dashboardRoutes from './dashboard.js';
import appointmentsRoutes from './appointments.js';
import meetingRequestsRoutes from './meeting-requests.js';
import groupMeetingsRoutes from './group-meetings.js';
import recurrencePatternsRoutes from './recurrence-patterns.js';
import teamRequestsRoutes from './team-requests.js';
import { health } from '../controllers/healthController.js';

const router = Router();

router.get('/health', health);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/owners', ownersRoutes);
router.use('/invite', inviteRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/appointments', appointmentsRoutes);
router.use('/meeting-requests', meetingRequestsRoutes);
router.use('/group-meetings', groupMeetingsRoutes);
router.use('/recurrence-patterns', recurrencePatternsRoutes);
router.use('/team-requests', teamRequestsRoutes);
router.use('/slots', slotsRoutes);
router.use('/bookings', bookingsRoutes);

export default router;
