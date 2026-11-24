jest.mock('../db.js', () => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn()
  },
  revokedToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn()
  }
}));

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db.js');
const app = require('../app.js');
const { getCsrfHeaders } = require('./csrf-test-helper.js');

describe('registration, login, and logout', () => {
  let server;
  let baseUrl;
  let savedUser;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_ISSUER = 'e-commerce';
    process.env.JWT_AUDIENCE = 'e-commerce-api';

    db.user.findUnique.mockImplementation(async ({ where }) => {
      if (where.email) return savedUser?.email === where.email ? savedUser : null;
      if (where.id) return savedUser?.id === where.id ? savedUser : null;
      return null;
    });
    db.user.create.mockImplementation(async ({ data }) => {
      savedUser = { id: 8, banned: false, ...data };
      return savedUser;
    });
    db.user.findMany.mockImplementation(async () => (savedUser ? [savedUser] : []));
    db.revokedToken.findUnique.mockImplementation(async ({ where }) => (
      db.revokedToken.create.mock.calls.some(([{ data }]) => data.id === where.id)
        ? { id: where.id }
        : null
    ));
    db.revokedToken.create.mockResolvedValue({});
    db.revokedToken.deleteMany.mockResolvedValue({ count: 0 });

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
    savedUser = undefined;
    jest.clearAllMocks();
  });

  it('hashes the password, logs in, revokes the token, and rejects it afterward', async () => {
    const email = 'alice@example.test';
    const password = 'correct-horse-battery-staple';
    const registerResponse = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: await getCsrfHeaders(baseUrl, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email, password, name: 'Alice', role: 'admin' })
    });
    const registration = await registerResponse.json();

    expect(registerResponse.status).toBe(201);
    expect(savedUser.role).toBe('user');
    expect(savedUser.password).not.toBe(password);
    expect(savedUser.password).toMatch(/^\$2[aby]\$10\$/);
    expect(await bcrypt.compare(password, savedUser.password)).toBe(true);
    expect(registration.user.password).toBeUndefined();
    expect(JSON.stringify(registration)).not.toContain(password);
    expect(registration.token).toBeUndefined();
    const registrationCookie = registerResponse.headers.get('set-cookie');
    expect(registrationCookie).toContain('HttpOnly');
    expect(registrationCookie).toContain('SameSite=Lax');
    expect(registrationCookie).toContain('Path=/');
    expect(registrationCookie).toContain('Max-Age=604800');
    const registrationToken = decodeURIComponent(
      registrationCookie.split(';')[0].split('=').slice(1).join('=')
    );
    const registrationClaims = jwt.verify(registrationToken, process.env.JWT_SECRET, {
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE
    });

    const deniedAdminPage = await fetch(`${baseUrl}/users/admin/utilisateurs`, {
      headers: { Cookie: `session=${encodeURIComponent(registrationToken)}` }
    });
    expect(deniedAdminPage.status).toBe(403);
    expect(await deniedAdminPage.json()).toEqual({ erreur: 'Access denied' });

    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: await getCsrfHeaders(baseUrl, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email, password })
    });
    const login = await loginResponse.json();

    expect(loginResponse.status).toBe(200);
    expect(login.token).toBeUndefined();
    expect(login.user.password).toBeUndefined();

    const loginCookie = loginResponse.headers.get('set-cookie');
    expect(loginCookie).toContain('HttpOnly');
    expect(loginCookie).toContain('SameSite=Lax');
    expect(loginCookie).toContain('Max-Age=604800');
    expect(loginCookie).not.toContain('Secure');
    const token = decodeURIComponent(loginCookie.split(';')[0].split('=').slice(1).join('='));
    const claims = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE
    });
    expect(claims.jti).not.toBe(registrationClaims.jti);
    const logoutResponse = await fetch(`${baseUrl}/auth/disconnect`, {
      method: 'POST',
      headers: await getCsrfHeaders(baseUrl, {
        Cookie: `session=${encodeURIComponent(token)}`
      })
    });

    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(logoutResponse.headers.get('set-cookie')).toContain('HttpOnly');
    expect(db.revokedToken.create).toHaveBeenCalledWith({
      data: { id: claims.jti, expiresAt: new Date(claims.exp * 1000) }
    });

    const profileResponse = await fetch(`${baseUrl}/users/me`, {
      headers: { Cookie: `session=${encodeURIComponent(token)}` }
    });

    expect(profileResponse.status).toBe(401);
    expect(await profileResponse.json()).toEqual({ erreur: 'Token révoqué.' });
  });

  it('sets Secure when explicitly enabled', async () => {
    process.env.COOKIE_SECURE = 'true';
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: await getCsrfHeaders(baseUrl, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email: 'secure@example.test', password: 'long password', name: 'Secure' })
    });
    delete process.env.COOKIE_SECURE;

    expect(response.status).toBe(201);
    expect(response.headers.get('set-cookie')).toContain('Secure');
  });

  it('does not expose database errors from registration', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    db.user.findUnique.mockRejectedValueOnce(new Error('private database details'));
    try {
      const response = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: await getCsrfHeaders(baseUrl, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          email: 'db-error@example.test',
          password: 'valid-long-password',
          name: 'DB Error'
        })
      });
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe('Une erreur inattendue est survenue. Veuillez réessayer plus tard.');
      expect(body.referenceId).toEqual(expect.any(String));
      expect(JSON.stringify(body)).not.toContain('private database details');
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining('POST /auth/register -> 500'),
        expect.objectContaining({ message: 'private database details' })
      );
    } finally {
      errorLog.mockRestore();
    }
  });

  it('uses the current database role for admin access', async () => {
    savedUser = {
      id: 12,
      email: 'admin@example.test',
      name: 'Admin',
      role: 'admin',
      banned: false
    };
    const token = jwt.sign(
      { id: savedUser.id, role: 'user' },
      process.env.JWT_SECRET,
      {
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        jwtid: 'admin-role-test',
        expiresIn: '1h'
      }
    );

    const response = await fetch(`${baseUrl}/users/admin/utilisateurs`, {
      headers: { Cookie: `session=${encodeURIComponent(token)}` }
    });

    expect(response.status).toBe(200);
    expect(db.user.findMany).toHaveBeenCalled();
  });

  it('requires a minimum password length without complexity rules', async () => {
    const shortResponse = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: await getCsrfHeaders(baseUrl, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email: 'short@example.test', password: 'short', name: 'Short' })
    });

    expect(shortResponse.status).toBe(400);
    expect(await shortResponse.json()).toEqual({
      erreur: 'Le mot de passe doit contenir au moins 12 caractères et au maximum 72 octets.'
    });
    expect(db.user.create).not.toHaveBeenCalled();

    db.user.findUnique.mockResolvedValueOnce(null);
    const validResponse = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: await getCsrfHeaders(baseUrl, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email: 'simple@example.test', password: 'long password', name: 'Simple' })
    });

    expect(validResponse.status).toBe(201);
  });
});
