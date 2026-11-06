const { Router } = require('express');
const user = require('../controllers/users.controller.js');
const authMiddleware = require('../midleware/auth.js');
const roleMiddleware = require('../midleware/roles.js');

const router = Router();

router.get('/me', authMiddleware, user.getProfile());
router.patch('/me', authMiddleware, user.updateProfile());
router.get('/admin/utilisateurs', authMiddleware, roleMiddleware('admin'), user.getAllUser());
router.patch('/ban/:id', authMiddleware, roleMiddleware('admin'), user.banUser());
router.patch('/unban/:id', authMiddleware, roleMiddleware('admin'), user.unbanUser());
router.patch('/role/:id', authMiddleware, roleMiddleware('admin'), user.updateUserRole());

module.exports = router;