const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db.js');

const secret = () => process.env.JWT_SECRET || 'dev-secret';
const issuer = () => process.env.JWT_ISSUER || 'e-commerce';
const audience = () => process.env.JWT_AUDIENCE || 'e-commerce-api';

const sanitizeUser = (user) => {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
};

const register = () => async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ erreur: 'email, password et name sont requis.' });
    }

    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ erreur: 'Un utilisateur avec cet email existe déjà.' });
    }

    if (role && !['client', 'vendeur'].includes(role)) {
      return res.status(400).json({ erreur: 'Rôle invalide. Les rôles valides sont : client, vendeur.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: role || 'client'
      }
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      secret(),
      { issuer: issuer(), audience: audience(), expiresIn: '7d' }
    );

    return res.status(201).json({
      message: 'Compte créé avec succès.',
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de la création du compte.', detail: error.message });
  }
};

const login = () => async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ erreur: 'email et password sont requis.' });
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ erreur: 'Mot de passe incorrect.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      secret(),
      { issuer: issuer(), audience: audience(), expiresIn: '7d' }
    );

    return res.status(200).json({
      message: 'Connexion réussie.',
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    return res.status(500).json({ erreur: 'Erreur lors de la connexion.', detail: error.message });
  }
};

const disconnect = () => (req, res) => res.status(200).json({ message: 'Déconnexion réussie.' });

module.exports = { register, login, disconnect };