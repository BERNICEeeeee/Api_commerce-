jest.mock('../db.js', () => ({
  user: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  revokedToken: {
    findUnique: jest.fn()
  },
  order: {
    findFirst: jest.fn(),
    create: jest.fn()
  }
}));

const jwt = require('jsonwebtoken');
const db = require('../db.js');
const app = require('../app.js');
const { getCsrfHeaders } = require('./csrf-test-helper.js');

describe('CSRF protection and safe GET requests', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_ISSUER = 'e-commerce';
    process.env.JWT_AUDIENCE = 'e-commerce-api';

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ id: 8, role: 'user' });
    db.user.update.mockResolvedValue({
      id: 8,
      role: 'user',
      name: 'Updated',
      email: 'user@example.test'
    });
    db.revokedToken.findUnique.mockResolvedValue(null);
    db.order.findFirst.mockResolvedValue(null);
  });

  it('refuses a state-changing request without a CSRF token', async () => {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'csrf@example.test',
        password: 'valid-long-password',
        name: 'CSRF'
      })
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ erreur: 'Jeton CSRF manquant ou invalide.' });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a cross-origin request even when its CSRF token is valid', async () => {
    const headers = await getCsrfHeaders(baseUrl, {
      Origin: 'https://attacker.example',
      'Content-Type': 'application/json'
    });
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'user@example.test', password: 'password' })
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ erreur: 'Jeton CSRF manquant ou invalide.' });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('requires a CSRF token for a session-cookie mutation even with the matching Origin', async () => {
    const token = jwt.sign(
      { id: 8, role: 'user' },
      process.env.JWT_SECRET,
      {
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        jwtid: 'csrf-cookie-test',
        expiresIn: '1h'
      }
    );
    const request = {
      method: 'PATCH',
      headers: {
        Cookie: `session=${encodeURIComponent(token)}`,
        Origin: baseUrl,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Updated' })
    };

    const denied = await fetch(`${baseUrl}/users/me`, request);

    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ erreur: 'Jeton CSRF manquant ou invalide.' });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();

    const allowed = await fetch(`${baseUrl}/users/me`, {
      ...request,
      headers: await getCsrfHeaders(baseUrl, {
        Cookie: `session=${encodeURIComponent(token)}`,
        Origin: baseUrl,
        'Content-Type': 'application/json'
      })
    });

    expect(allowed.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { name: 'Updated' }
    });
  });

  it('issues a readable SameSite CSRF cookie and accepts its matching header', async () => {
    const csrfResponse = await fetch(`${baseUrl}/auth/csrf`);
    const { csrfToken } = await csrfResponse.json();
    const csrfCookie = csrfResponse.headers.get('set-cookie');

    expect(csrfResponse.status).toBe(200);
    expect(csrfResponse.headers.get('cache-control')).toBe('no-store');
    expect(csrfCookie).toContain('SameSite=Lax');
    expect(csrfCookie).not.toContain('HttpOnly');
    expect(csrfToken).toBeTruthy();

    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: await getCsrfHeaders(baseUrl, {
        Origin: baseUrl,
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({ email: 'unknown@example.test', password: 'password' })
    });

    expect(response.status).toBe(401);
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'unknown@example.test' }
    });
  });

  it('does not create an order when reading an empty cart with GET', async () => {
    const token = jwt.sign(
      { id: 8, role: 'user' },
      process.env.JWT_SECRET,
      {
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        jwtid: 'csrf-safe-get',
        expiresIn: '1h'
      }
    );

    const response = await fetch(`${baseUrl}/panier`, {
      headers: { Cookie: `session=${encodeURIComponent(token)}` }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ panier: null });
    expect(db.order.findFirst).toHaveBeenCalledWith({
      where: { userId: 8, status: 'pending' },
      include: { items: true }
    });
    expect(db.order.create).not.toHaveBeenCalled();
  });
});
