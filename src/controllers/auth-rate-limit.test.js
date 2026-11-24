const express = require('express');
const { createLoginRateLimiters } = require('../middleware/login-rate-limit.js');

const startRateLimitedServer = async (limits) => {
  const app = express();
  app.use(express.json());
  const rateLimiters = createLoginRateLimiters({
    windowMs: 60_000,
    ...limits
  });
  app.post('/auth/login', rateLimiters.byIp, rateLimiters.byAccount, (_req, res) => (
    res.status(401).json({ erreur: 'Identifiants invalides.' })
  ));

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    server,
    url: `http://127.0.0.1:${server.address().port}/auth/login`
  };
};

const attemptLogin = (url, email) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'un-mot-de-passe-test' })
});

const closeServer = (server) => new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
});

describe('login rate limits', () => {
  it('limits repeated attempts for the same account', async () => {
    const { server, url } = await startRateLimitedServer({ ipLimit: 10, accountLimit: 2 });
    try {
      expect((await attemptLogin(url, 'alice@example.test')).status).toBe(401);
      expect((await attemptLogin(url, 'ALICE@example.test')).status).toBe(401);

      const blocked = await attemptLogin(url, 'alice@example.test');
      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toEqual({
        erreur: 'Trop de tentatives. Réessayez plus tard.'
      });
    } finally {
      await closeServer(server);
    }
  });

  it('limits attempts from the same IP across different accounts', async () => {
    const { server, url } = await startRateLimitedServer({ ipLimit: 2, accountLimit: 10 });
    try {
      expect((await attemptLogin(url, 'alice@example.test')).status).toBe(401);
      expect((await attemptLogin(url, 'bob@example.test')).status).toBe(401);

      const blocked = await attemptLogin(url, 'carol@example.test');
      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toEqual({
        erreur: 'Trop de tentatives. Réessayez plus tard.'
      });
    } finally {
      await closeServer(server);
    }
  });
});
