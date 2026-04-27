// invite token lookup so students can reach an owner directly via shared link
import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth.js';
import { inviteByToken } from '../controllers/ownerBrowseController.js';

const router = Router();

router.get('/:token', isAuthenticated, inviteByToken);

export default router;
