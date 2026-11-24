const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const db = require('../db.js');
const {
  clearSessionCookie,
  setSessionCookie,
  SESSION_TTL_SECONDS
} = require('../middleware/session-cookie.js');
const { clearCsrfCookie } = require('../middleware/csrf.js');
const { verifyTotpOrRecoveryCode } = require('./totp.controller.js');

const secret = () => process.env.JWT_SECRET || 'dev-secret';
const issuer = () => process.env.JWT_ISSUER || 'e-commerce';
const audience = () => process.env.JWT_AUDIENCE || 'e-commerce-api';
const MIN_PASSWORD_LENGTH = 12;
const dummyPasswordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

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

const register = () => async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ erreur: 'email, password et name sont requis.' });
    }

    if (!isValidPasswordLength(password)) {
      return res.status(400).json({
        erreur: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères et au maximum 72 octets.`
      });
    }

    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ erreur: 'Un utilisateur avec cet email existe déjà.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'user'
      }
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      secret(),
      { issuer: issuer(), audience: audience(), expiresIn: SESSION_TTL_SECONDS, jwtid: crypto.randomUUID() }
    );

    setSessionCookie(res, token);
    return res.status(201).json({
      message: 'Compte créé avec succès.',
      user: sanitizeUser(user)
    });
  } catch (error) {
    return next(error);
  }
};

const login = () => async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || !email || typeof password !== 'string' || !password) {
      return res.status(400).json({ erreur: 'email et password sont requis.' });
    }

    const user = await db.user.findUnique({ where: { email } });
    const passwordMatches = await bcrypt.compare(password, user?.password || dummyPasswordHash);
    if (!user || !passwordMatches) {
      return res.status(401).json({ erreur: 'Identifiants invalides.' });
    }

    let usedRecoveryCode = false;
    if (user.totpEnabled) {
      const { totpCode, recoveryCode } = req.body;
      if (!totpCode && !recoveryCode) {
        return res.status(401).json({ erreur: 'Code de vérification requis ou invalide.' });
      }

      const validCode = await verifyTotpOrRecoveryCode(user, { totpCode, recoveryCode });
      if (!validCode) {
        return res.status(401).json({ erreur: 'Code de vérification requis ou invalide.' });
      }
      usedRecoveryCode = Boolean(recoveryCode);
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        ...(usedRecoveryCode ? { mfaRecoveryUntil: Math.floor(Date.now() / 1000) + 10 * 60 } : {})
      },
      secret(),
      { issuer: issuer(), audience: audience(), expiresIn: SESSION_TTL_SECONDS, jwtid: crypto.randomUUID() }
    );

    setSessionCookie(res, token);
    return res.status(200).json({
      message: 'Connexion réussie.',
      user: sanitizeUser(user)
    });
  } catch (error) {
    return next(error);
  }
};

const disconnect = () => async (req, res, next) => {
  try {
    await db.revokedToken.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });

    await db.revokedToken.create({
      data: {
        id: req.user.jti,
        expiresAt: new Date(req.user.exp * 1000)
      }
    });

    clearSessionCookie(res);
    clearCsrfCookie(res);
    return res.status(200).json({ message: 'Déconnexion réussie.' });
  } catch (error) {
    return next(error);
  }
};

module.exports = { register, login, disconnect };