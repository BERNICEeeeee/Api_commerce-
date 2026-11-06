const db = require('../db.js');

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
  try {
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

    const produit = await db.product.create({
      data: {
        name,
        description: description || null,
        price: Number(price),
        stock: Number(stock || 0),
        imageUrl: imageUrl || null,
        vendeurId: Number(vendeurId)
      }
    });

    return res.status(201).json({ message: 'Produit ajouté.', produit });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de l’ajout du produit.', detail: error.message });
  }
};

module.exports = { getCatalogue, getOneProduit, ajouterProduit };