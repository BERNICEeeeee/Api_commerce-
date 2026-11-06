const { Router } = require('express');
const auth = require('../controllers/auth.controller.js');

const router = Router();

router.get('/disconnect', auth.disconnect());
router.post('/login', auth.login());
router.post('/register', auth.register());

module.exports = router;