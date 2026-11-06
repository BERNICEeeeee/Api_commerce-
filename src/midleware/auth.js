const jwt = require('jsonwebtoken');

const secret = () => process.env.JWT_SECRET || 'dev-secret';
const issuer = () => process.env.JWT_ISSUER || 'e-commerce';
const audience = () => process.env.JWT_AUDIENCE || 'e-commerce-api';

function authenticate(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ erreur: 'Token manquant' });
  }

  try {
    const decoded = jwt.verify(token, secret(), {
      issuer: issuer(),
      audience: audience()
    });

    if (!decoded) {
      return res.status(401).json({ erreur: 'Token invalide' });
    }

    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ erreur: 'Token invalide' });
  }
}

module.exports = authenticate;