const { Router } = require('express');
const produits = require('../controllers/produits.controller.js');
const authMiddleware = require('../midleware/auth.js');
const roleMiddleware = require('../midleware/roles.js');
const { uploadProductImage } = require('../middleware/product-image-upload.js');

const router = Router();

router.get('/catalogue', produits.getCatalogue());
router.get('/recherche', produits.rechercherProduits());
router.get('/images/:fileName', produits.getProductImage());
router.get('/:id', produits.getOneProduit());
router.post('/ajouter', authMiddleware, roleMiddleware('vendeur'), uploadProductImage, produits.ajouterProduit());

module.exports = router;