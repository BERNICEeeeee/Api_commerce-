const db = require('../db.js');

const getOrCreatePendingOrder = async (userId) => {
  let order = await db.order.findFirst({
    where: {
      userId,
      status: 'pending'
    },
    include: {
      items: true
    }
  });

  if (!order) {
    order = await db.order.create({
      data: {
        userId,
        total: 0,
        status: 'pending'
      },
      include: {
        items: true
      }
    });
  }

  return order;
};

const getPanier = () => async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ erreur: 'Authentification requise.' });
    }

    const order = await getOrCreatePendingOrder(userId);
    return res.status(200).json({ panier: order });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de la récupération du panier.', detail: error.message });
  }
};

const addToPanier = () => async (req, res) => {
  try {
    const userId = req.user?.id;
    const productId = Number(req.params.id);
    const quantity = Number(req.body.quantity ?? 1);

    if (!userId) {
      return res.status(401).json({ erreur: 'Authentification requise.' });
    }

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ erreur: 'Identifiant produit invalide.' });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ erreur: 'quantity doit être un entier positif.' });
    }

    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ erreur: 'Produit introuvable.' });
    }

    const order = await getOrCreatePendingOrder(userId);

    const existingItem = order.items.find((item) => item.productId === product.id);

    if (existingItem) {
      const updatedItem = await db.orderItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + quantity,
          price: product.price
        }
      });

      return res.status(200).json({ message: 'Produit mis à jour dans le panier.', item: updatedItem });
    }

    const item = await db.orderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        quantity,
        price: product.price
      }
    });

    return res.status(201).json({ message: 'Produit ajouté au panier.', item });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de l’ajout au panier.', detail: error.message });
  }
};

const updatePanier = () => async (req, res) => {
  try {
    const userId = req.user?.id;
    const itemId = Number(req.params.id);
    const quantity = Number(req.body.quantity);

    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ erreur: 'Identifiant de ligne de panier invalide.' });
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ erreur: 'quantity doit être un entier positif.' });
    }

    const item = await db.orderItem.findFirst({
      where: {
        id: itemId,
        order: { userId, status: 'pending' }
      }
    });

    if (!item) {
      return res.status(404).json({ erreur: 'Ligne de panier introuvable.' });
    }

    const updatedItem = await db.orderItem.update({
      where: { id: item.id },
      data: { quantity }
    });

    return res.status(200).json({ message: 'Panier mis à jour.', item: updatedItem });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de la mise à jour du panier.', detail: error.message });
  }
};

const deleteFromPanier = () => async (req, res) => {
  try {
    const userId = req.user?.id;
    const itemId = Number(req.params.id);

    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ erreur: 'Identifiant de ligne de panier invalide.' });
    }

    const item = await db.orderItem.findFirst({
      where: {
        id: itemId,
        order: { userId, status: 'pending' }
      }
    });

    if (!item) {
      return res.status(404).json({ erreur: 'Ligne de panier introuvable.' });
    }

    await db.orderItem.delete({ where: { id: item.id } });
    return res.status(200).json({ message: 'Produit supprimé du panier.' });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de la suppression du panier.', detail: error.message });
  }
};

module.exports = { getPanier, addToPanier, updatePanier, deleteFromPanier };