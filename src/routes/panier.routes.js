const { Router } = require('express');
const panier = require('../controllers/panier.controller.js');
const authMiddleware = require('../midleware/auth.js');
const roleMiddleware = require('../midleware/roles.js');

const router = Router();

router.get('/', authMiddleware, roleMiddleware('client'), panier.getPanier());
router.delete('/delete/:id', authMiddleware, roleMiddleware('client'), panier.deleteFromPanier());
router.post('/ajouter/:id', authMiddleware, roleMiddleware('client'), panier.addToPanier());
router.patch('/modifier/:id', authMiddleware, roleMiddleware('client'), panier.updatePanier());

module.exports = router;