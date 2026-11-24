const jwt = require('jsonwebtoken');
const db = require('../db.js');
const { readSessionCookie } = require('../middleware/session-cookie.js');

const secret = () => process.env.JWT_SECRET || 'dev-secret';
const issuer = () => process.env.JWT_ISSUER || 'e-commerce';
const audience = () => process.env.JWT_AUDIENCE || 'e-commerce-api';

async function authenticate(req, res, next) {
  const token = readSessionCookie(req.headers.cookie);

  if (!token) {
    return res.status(401).json({ erreur: 'Session manquante.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, secret(), {
      issuer: issuer(),
      audience: audience()
    });

    if (!decoded || typeof decoded === 'string' || !decoded.jti || !decoded.exp) {
      return res.status(401).json({ erreur: 'Token invalide' });
    }
  } catch (error) {
    return res.status(401).json({ erreur: 'Token invalide' });
  }

  try {
    const revokedToken = await db.revokedToken.findUnique({
      where: { id: decoded.jti }
    });

    if (revokedToken) {
      return res.status(401).json({ erreur: 'Token révoqué.' });
    }

    const user = await db.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, role: true }
    });

    if (!user) {
      return res.status(401).json({ erreur: 'Utilisateur introuvable.' });
    }

    req.user = { ...decoded, role: user.role };
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = authenticate;