const db = require('../db.js');
const fs = require('node:fs/promises');
const {
  deleteProductImage,
  getImageContentType,
  getProductImagePath,
  storeProductImage
} = require('../services/product-images.js');

const getProductImage = () => async (req, res) => {
  const filePath = getProductImagePath(req.params.fileName);
  const contentType = getImageContentType(req.params.fileName);

  if (!filePath || !contentType) {
    return res.status(404).json({ erreur: 'Image introuvable.' });
  }

  try {
    await fs.access(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ erreur: 'Image introuvable.' });
    }
    return res.status(500).json({ erreur: 'Erreur lors de la lecture de l’image.' });
  }

  res.set({
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${req.params.fileName}"`,
    'X-Content-Type-Options': 'nosniff'
  });
  return res.sendFile(filePath, (error) => {
    if (error && !res.headersSent) {
      return res.status(500).json({ erreur: 'Erreur lors de l’envoi de l’image.' });
    }
  });
};

const getCatalogue = () => async (req, res) => {
  try {
    const produits = await db.product.findMany({
      include: {
        vendeur: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ produits });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors du chargement du catalogue.', detail: error.message });
  }
};

const rechercherProduits = () => async (req, res) => {
  try {
    const valeurRecherche = req.query.q;
    if (typeof valeurRecherche !== 'string' || !valeurRecherche.trim()) {
      return res.status(400).json({ erreur: 'Le paramètre q est requis.' });
    }
    const recherche = valeurRecherche.trim();

    const produits = await db.product.findMany({
      where: {
        OR: [
          { name: { contains: recherche, mode: 'insensitive' } },
          { description: { contains: recherche, mode: 'insensitive' } }
        ]
      },
      include: {
        vendeur: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ produits });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de la recherche de produits.', detail: error.message });
  }
};

const getOneProduit = () => async (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!productId) {
      return res.status(400).json({ erreur: 'Identifiant produit invalide.' });
    }

    const produit = await db.product.findUnique({
      where: { id: productId },
      include: {
        vendeur: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!produit) {
      return res.status(404).json({ erreur: 'Produit introuvable.' });
    }

    return res.status(200).json({ produit });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de la récupération du produit.', detail: error.message });
  }
};

const ajouterProduit = () => async (req, res) => {
  let savedImage;
  try {
    const allowedFields = ['name', 'description', 'price', 'stock', 'imageUrl'];
    if (Object.keys(req.body).some((field) => !allowedFields.includes(field))) {
      return res.status(400).json({ erreur: 'Champ de produit non autorisé.' });
    }

    const { name, description, price, stock, imageUrl } = req.body;
    const vendeurId = req.user?.id;

    if (!vendeurId) {
      return res.status(401).json({ erreur: 'Authentification requise.' });
    }

    const vendeur = await db.user.findUnique({ where: { id: Number(vendeurId) } });
    if (!vendeur) {
      return res.status(404).json({ erreur: 'Vendeur introuvable.' });
    }
    if (vendeur.banned) {
      return res.status(403).json({ erreur: 'Un vendeur banni ne peut pas publier de nouvelles offres.' });
    }

    if (!name || !price) {
      return res.status(400).json({ erreur: 'name et price sont requis.' });
    }

    if (req.file && imageUrl) {
      return res.status(400).json({ erreur: 'Fournissez une image ou imageUrl, pas les deux.' });
    }

    if (req.file) {
      try {
        savedImage = await storeProductImage(req.file);
      } catch (error) {
        return res.status(error.status || 500).json({ erreur: error.message });
      }
    }

    const produit = await db.product.create({
      data: {
        name,
        description: description || null,
        price: Number(price),
        stock: Number(stock || 0),
        imageUrl: savedImage?.url || imageUrl || null,
        vendeurId: Number(vendeurId)
      }
    });

    return res.status(201).json({ message: 'Produit ajouté.', produit });
  } catch (error) {
    if (savedImage) {
      try {
        await deleteProductImage(savedImage.fileName);
      } catch (cleanupError) {
        console.error('Impossible de supprimer une image produit après échec de création.', cleanupError);
      }
    }
    return res.status(500).json({ erreur: 'Erreur lors de l’ajout du produit.', detail: error.message });
  }
};

module.exports = { getCatalogue, rechercherProduits, getOneProduit, getProductImage, ajouterProduit };