import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth.js';
import {
  listOwnersWithActiveSlots,
  listOwnerActiveSlots,
} from '../controllers/ownerBrowseController.js';

const router = Router();

router.get('/', isAuthenticated, listOwnersWithActiveSlots);
router.get('/:id/slots', isAuthenticated, listOwnerActiveSlots);

export default router;
