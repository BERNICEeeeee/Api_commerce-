const { Router } = require('express');
const auth = require('../controllers/auth.controller.js');
const authMiddleware = require('../midleware/auth.js');
const { loginRateLimiters } = require('../middleware/login-rate-limit.js');
const { issueCsrfToken } = require('../middleware/csrf.js');
const totp = require('../controllers/totp.controller.js');

const router = Router();

router.get('/csrf', issueCsrfToken);
router.post('/disconnect', authMiddleware, auth.disconnect());
router.post('/login', loginRateLimiters.byIp, loginRateLimiters.byAccount, auth.login());
router.post('/register', auth.register());
router.post('/totp/setup', authMiddleware, totp.startSetup());
router.post('/totp/enable', authMiddleware, totp.enable());
router.post('/totp/disable', authMiddleware, totp.disable());

module.exports = router;