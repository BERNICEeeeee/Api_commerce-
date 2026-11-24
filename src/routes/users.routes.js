const { Router } = require('express');
const user = require('../controllers/users.controller.js');
const authMiddleware = require('../midleware/auth.js');
const roleMiddleware = require('../midleware/roles.js');

const router = Router();
const adminRouter = Router();

router.use(authMiddleware);
router.get('/me', user.getProfile());
router.patch('/me', user.updateProfile());
router.delete('/me', user.deleteAccount());

adminRouter.use(roleMiddleware('admin'));
adminRouter.get('/utilisateurs', user.getAllUser());
adminRouter.patch('/ban/:id', user.banUser());
adminRouter.patch('/unban/:id', user.unbanUser());
adminRouter.patch('/role/:id', user.updateUserRole());

router.use('/admin', adminRouter);

module.exports = router;