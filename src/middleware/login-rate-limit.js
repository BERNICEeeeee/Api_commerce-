const { rateLimit } = require('express-rate-limit');

const createLoginRateLimiters = ({
  windowMs = 15 * 60 * 1000,
  ipLimit = 5,
  accountLimit = 5
} = {}) => {
  const limitResponse = (_req, res) => res.status(429).json({
    erreur: 'Trop de tentatives. Réessayez plus tard.'
  });

  const sharedOptions = {
    windowMs,
    standardHeaders: true,
    legacyHeaders: false,
    handler: limitResponse
  };

  return {
    byIp: rateLimit({
      ...sharedOptions,
      limit: ipLimit
    }),
    byAccount: rateLimit({
      ...sharedOptions,
      limit: accountLimit,
      keyGenerator: (req) => {
        const email = req.body?.email;
        return typeof email === 'string'
          ? email.trim().toLowerCase() || 'empty-account'
          : 'invalid-account';
      }
    })
  };
};

const loginRateLimiters = createLoginRateLimiters();

module.exports = { createLoginRateLimiters, loginRateLimiters };
