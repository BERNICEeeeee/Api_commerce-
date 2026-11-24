const SESSION_COOKIE_NAME = 'session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_TTL_SECONDS * 1000
});

const readSessionCookie = (cookieHeader = '') => {
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE_NAME) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch (error) {
      return null;
    }
  }
  return null;
};

const setSessionCookie = (res, token) => {
  res.cookie(SESSION_COOKIE_NAME, token, cookieOptions());
};

const clearSessionCookie = (res) => {
  const { maxAge, ...clearOptions } = cookieOptions();
  res.clearCookie(SESSION_COOKIE_NAME, clearOptions);
};

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie
};
