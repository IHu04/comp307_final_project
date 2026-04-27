// public owner discovery for students browsing who has open slots
import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth.js';
import {
  listOwnersWithActiveSlots,
  listOwnerActiveSlots,
} from '../controllers/ownerBrowseController.js';

const router = Router();

// returns all owners who currently have at least one bookable slot
router.get('/', isAuthenticated, listOwnersWithActiveSlots);

// returns the active slots for a specific owner
router.get('/:id/slots', isAuthenticated, listOwnerActiveSlots);

export default router;
