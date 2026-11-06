const db = require('../db.js');
const Comment = require('../models/Comment');

const getCommentsByProduct = () => async (req, res) => {
  try {
    const productId = Number(req.params.productId);

    if (!productId) {
      return res.status(400).json({ erreur: 'Identifiant produit invalide.' });
    }

    const comments = await Comment.find({ productId }).sort({ createdAt: -1 });
    return res.status(200).json({ comments });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de la récupération des commentaires.', detail: error.message });
  }
};

const addComment = () => async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const { content, rating } = req.body;
    const userId = Number(req.user?.id);

    if (!productId) {
      return res.status(400).json({ erreur: 'Identifiant produit invalide.' });
    }

    if (!userId) {
      return res.status(401).json({ erreur: 'Authentification requise.' });
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
    }

    if (user.role !== 'client') {
      return res.status(403).json({ erreur: 'Seuls les clients peuvent ajouter un commentaire.' });
    }

    if (user.banned) {
      return res.status(403).json({ erreur: 'Un client banni ne peut pas ajouter de commentaire.' });
    }

    if (!content || !rating) {
      return res.status(400).json({ erreur: 'content et rating sont requis.' });
    }

    const parsedRating = Number(rating);
    if (Number.isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ erreur: 'rating doit être un nombre entre 1 et 5.' });
    }

    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({ erreur: 'Produit introuvable.' });
    }

    const comment = await Comment.create({
      productId,
      userId,
      userName: user.name,
      content,
      rating: parsedRating
    });

    return res.status(201).json({ message: 'Commentaire ajouté.', comment });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de l’ajout du commentaire.', detail: error.message });
  }
};

module.exports = { getCommentsByProduct, addComment };