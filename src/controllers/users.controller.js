const bcrypt = require('bcryptjs');
const db = require('../db.js');
const { clearSessionCookie } = require('../middleware/session-cookie.js');
const { clearCsrfCookie } = require('../middleware/csrf.js');
const { verifyTotpOrRecoveryCode } = require('./totp.controller.js');
const { deleteUserProductImages, eraseUserComments } = require('../services/account-erasure.js');

const MIN_PASSWORD_LENGTH = 12;
const isValidPasswordLength = (password) => (
  typeof password === 'string' &&
  password.length >= MIN_PASSWORD_LENGTH &&
  Buffer.byteLength(password, 'utf8') <= 72
);

const sanitizeUser = (user) => {
  if (!user) return null;
  const { password, totpSecret, ...safeUser } = user;
  return safeUser;
};

const getProfile = () => async (req, res) => {
  try {
    const userId = Number(req.user?.id);
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
    const allowedFields = ['name', 'email', 'password'];
    if (Object.keys(req.body).some((field) => !allowedFields.includes(field))) {
      return res.status(400).json({ erreur: 'Champ de profil non autorisé.' });
    }

    const { name, email, password } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ erreur: 'Authentification requise.' });
    }

    if (password !== undefined && !isValidPasswordLength(password)) {
      return res.status(400).json({
        erreur: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères et au maximum 72 octets.`
      });
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

const deleteAccount = () => async (req, res, next) => {
  try {
    const { password, totpCode, recoveryCode } = req.body;
    if (
      Object.keys(req.body).some((field) => !['password', 'totpCode', 'recoveryCode'].includes(field)) ||
      typeof password !== 'string'
    ) {
      return res.status(400).json({ erreur: 'Mot de passe et facteur de vérification requis.' });
    }

    const user = await db.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        password: true,
        totpEnabled: true,
        totpSecret: true,
        products: {
          select: {
            id: true,
            imageUrl: true,
            orderItems: {
              select: { order: { select: { userId: true } } }
            }
          }
        }
      }
    });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ erreur: 'Identifiants invalides.' });
    }

    if (user.totpEnabled) {
      const recoveryLoginIsRecent = Number.isSafeInteger(req.user.mfaRecoveryUntil) &&
        req.user.mfaRecoveryUntil >= Math.floor(Date.now() / 1000);
      const validFactor = recoveryLoginIsRecent && !totpCode && !recoveryCode
        ? true
        : await verifyTotpOrRecoveryCode(user, { totpCode, recoveryCode });
      if (!validFactor) {
        return res.status(401).json({ erreur: 'Code de vérification invalide.' });
      }
    }

    const productsToKeep = user.products.filter((product) => (
      product.orderItems.some(({ order }) => order.userId !== user.id)
    ));
    const retainedProductIds = productsToKeep.map(({ id }) => id);

    await eraseUserComments(user.id);
    await deleteUserProductImages(user.products);

    await db.$transaction(async (transaction) => {
      await transaction.order.deleteMany({ where: { userId: user.id } });
      if (retainedProductIds.length > 0) {
        await transaction.product.updateMany({
          where: { id: { in: retainedProductIds }, vendeurId: user.id },
          data: { vendeurId: null, imageUrl: null }
        });
      }
      await transaction.product.deleteMany({
        where: { vendeurId: user.id, id: { notIn: retainedProductIds } }
      });
      await transaction.user.delete({ where: { id: user.id } });
    });

    clearSessionCookie(res);
    clearCsrfCookie(res);
    return res.status(200).json({
      message: 'Compte supprimé. Les commandes et produits historiques conservés ne sont plus associés à votre compte.'
    });
  } catch (error) {
    return next(error);
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

    const allowedRoles = ['user', 'admin'];
    if (!role || !allowedRoles.includes(role)) {
      return res.status(400).json({ erreur: 'Rôle invalide. Valeurs autorisées: user, admin.' });
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
  deleteAccount,
  getAllUser,
  banUser,
  unbanUser,
  updateUserRole
};
