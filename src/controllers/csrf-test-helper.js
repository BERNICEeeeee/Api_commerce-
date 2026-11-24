const getCsrfHeaders = async (baseUrl, headers = {}) => {
  const response = await fetch(`${baseUrl}/auth/csrf`);
  if (!response.ok) {
    throw new Error(`Impossible d'obtenir le jeton CSRF : HTTP ${response.status}`);
  }

  const { csrfToken } = await response.json();
  const csrfCookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!csrfToken || !csrfCookie) {
    throw new Error('La réponse CSRF ne contient pas le jeton et son cookie.');
  }

  return {
    ...headers,
    Cookie: [headers.Cookie, csrfCookie].filter(Boolean).join('; '),
    'X-CSRF-Token': csrfToken
  };
};

module.exports = { getCsrfHeaders };
