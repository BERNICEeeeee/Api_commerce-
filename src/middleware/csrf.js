const crypto = require('node:crypto');

const CSRF_COOKIE_NAME = 'csrfToken';
const CSRF_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const secret = () => process.env.CSRF_SECRET || process.env.JWT_SECRET || 'dev-secret';
const isSecureCookie = () => (
  process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production'
);

const signTokenData = (issuedAt, nonce) => crypto
  .createHmac('sha256', secret())
  .update(`${issuedAt}.${nonce}`)
  .digest('base64url');

const createCsrfToken = () => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(32).toString('base64url');
  return `${issuedAt}.${nonce}.${signTokenData(issuedAt, nonce)}`;
};

const readCookie = (cookieHeader = '', cookieName) => {
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== cookieName) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch (error) {
      return null;
    }
  }
  return null;
};

const isValidCsrfToken = (token) => {
  if (typeof token !== 'string') return false;
  const [issuedAtValue, nonce, signature, ...extra] = token.split('.');
  if (!issuedAtValue || !nonce || !signature || extra.length > 0) return false;

  const issuedAt = Number(issuedAtValue);
  const now = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(issuedAt) ||
    now - issuedAt > CSRF_TOKEN_TTL_MS / 1000 ||
    issuedAt > now + 30
  ) return false;

  const suppliedSignature = Buffer.from(signature);
  const expectedSignature = Buffer.from(signTokenData(issuedAtValue, nonce));
  return suppliedSignature.length === expectedSignature.length &&
    crypto.timingSafeEqual(suppliedSignature, expectedSignature);
};

const originMatches = (req) => {
  const source = req.get('origin') || req.get('referer');
  if (!source) return true;

  try {
    const sourceOrigin = new URL(source).origin;
    const expectedOrigin = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
    return sourceOrigin === new URL(expectedOrigin).origin;
  } catch (error) {
    return false;
  }
};

const issueCsrfToken = (_req, res) => {
  const csrfToken = createCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: isSecureCookie(),
    sameSite: 'lax',
    path: '/',
    maxAge: CSRF_TOKEN_TTL_MS
  });
  res.set('Cache-Control', 'no-store');
  return res.status(200).json({ csrfToken });
};

const clearCsrfCookie = (res) => {
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure: isSecureCookie(),
    sameSite: 'lax',
    path: '/'
  });
};

const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const headerToken = req.get('x-csrf-token');
  const cookieToken = readCookie(req.headers.cookie, CSRF_COOKIE_NAME);
  if (
    !originMatches(req) ||
    !headerToken ||
    !cookieToken ||
    headerToken !== cookieToken ||
    !isValidCsrfToken(headerToken)
  ) {
    return res.status(403).json({ erreur: 'Jeton CSRF manquant ou invalide.' });
  }

  return next();
};

module.exports = {
  clearCsrfCookie,
  csrfProtection,
  issueCsrfToken
};
