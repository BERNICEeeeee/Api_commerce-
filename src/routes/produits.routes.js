const { Router } = require('express');
const produits = require('../controllers/produits.controller.js');
const authMiddleware = require('../midleware/auth.js');
const roleMiddleware = require('../midleware/roles.js');

const router = Router();

router.get('/catalogue', produits.getCatalogue());
router.get('/:id', produits.getOneProduit());
router.post('/ajouter', authMiddleware, roleMiddleware('vendeur'), produits.ajouterProduit());

module.exports = router;