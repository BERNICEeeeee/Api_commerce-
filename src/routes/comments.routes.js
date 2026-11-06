const { Router } = require('express');
const comments = require('../controllers/comments.controller.js');
const authMiddleware = require('../midleware/auth.js');
const roleMiddleware = require('../midleware/roles.js');

const router = Router();

router.get('/:productId', comments.getCommentsByProduct());
router.post('/:productId', authMiddleware, roleMiddleware('client'), comments.addComment());

module.exports = router;