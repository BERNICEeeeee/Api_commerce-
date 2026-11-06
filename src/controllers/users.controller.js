const bcrypt = require('bcryptjs');
const db = require('../db.js');

const sanitizeUser = (user) => {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
};

const getProfile = () => async (req, res) => {
  try {
    const userId = Number(req.user?.id ?? req.body?.userId);
    if (!userId) {
      return res.status(400).json({ erreur: 'Identifiant utilisateur invalide.' });
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
    }

    return res.status(200).json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de la récupération du profil.', detail: error.message });
  }
};

const updateProfile = () => async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ erreur: 'Authentification requise.' });
    }

    const data = {};
    if (name) data.name = name;
    if (email) data.email = email;
    if (password) data.password = await bcrypt.hash(password, 10);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ erreur: 'Aucune modification fournie.' });
    }

    const updatedUser = await db.user.update({
      where: { id: userId },
      data
    });

    return res.status(200).json({ message: 'Profil mis à jour.', user: sanitizeUser(updatedUser) });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de la mise à jour du profil.', detail: error.message });
  }
};

const getAllUser = () => async (req, res) => {
  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ users: users.map(sanitizeUser) });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de la récupération des utilisateurs.', detail: error.message });
  }
};

const banUser = () => async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) {
      return res.status(400).json({ erreur: 'Identifiant utilisateur invalide.' });
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
    }

    if (user.banned) {
      return res.status(400).json({ erreur: 'L\'utilisateur est déjà banni.' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ erreur: 'Impossible de bannir un administrateur.' });
    }

    const updatedUser = await db.user.update({
      where: { id: userId },
      data: { banned: true }
    });

    return res.status(200).json({ message: 'Utilisateur banni.', user: sanitizeUser(updatedUser) });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors du bannissement.', detail: error.message });
  }
};

const unbanUser = () => async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!userId) {
      return res.status(400).json({ erreur: 'Identifiant utilisateur invalide.' });
    }

    const user = await db.user.update({
      where: { id: userId },
      data: { banned: false }
    });

    return res.status(200).json({ message: 'Utilisateur débanni.', user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors du débannissement.', detail: error.message });
  }
};

const updateUserRole = () => async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { role } = req.body;

    if (!userId) {
      return res.status(400).json({ erreur: 'Identifiant utilisateur invalide.' });
    }

    const allowedRoles = ['client', 'vendeur', 'admin'];
    if (!role || !allowedRoles.includes(role)) {
      return res.status(400).json({ erreur: 'Rôle invalide. Valeurs autorisées: client, vendeur, admin.' });
    }

    const user = await db.user.update({
      where: { id: userId },
      data: { role }
    });

    return res.status(200).json({ message: 'Rôle mis à jour.', user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de la mise à jour du rôle.', detail: error.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getAllUser,
  banUser,
  unbanUser,
  updateUserRole
};
