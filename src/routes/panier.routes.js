const { Router } = require('express');
const panier = require('../controllers/panier.controller.js');
const authMiddleware = require('../midleware/auth.js');
const roleMiddleware = require('../midleware/roles.js');

const router = Router();

router.use(authMiddleware, roleMiddleware('user'));
router.get('/', panier.getPanier());
router.delete('/delete/:id', panier.deleteFromPanier());
router.post('/ajouter/:id', panier.addToPanier());
router.patch('/modifier/:id', panier.updatePanier());

module.exports = router;