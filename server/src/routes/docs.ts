import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  createDocument,
  listDocuments,
  getDocument,
  updateDocument,
  deleteDocument,
} from '../controllers/docController.js';
import {
  listMembers,
  addMember,
  removeMember,
} from '../controllers/inviteController.js';

const router = Router();

// All document routes require authentication
router.use(authenticate);

router.post('/', createDocument);
router.get('/', listDocuments);
router.get('/:id', getDocument);
router.patch('/:id', updateDocument);
router.delete('/:id', deleteDocument);

// Member management
router.get('/:id/members', listMembers);
router.post('/:id/members', addMember);
router.delete('/:id/members/:userId', removeMember);

export default router;