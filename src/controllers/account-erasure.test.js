jest.mock('mongoose', () => ({
  connection: { readyState: 1 },
  connect: jest.fn()
}));

jest.mock('../models/Comment', () => ({
  deleteMany: jest.fn()
}));

jest.mock('../db.js', () => ({
  user: {
    findUnique: jest.fn(),
    delete: jest.fn()
  },
  revokedToken: {
    findUnique: jest.fn()
  },
  order: {
    deleteMany: jest.fn()
  },
  product: {
    updateMany: jest.fn(),
    deleteMany: jest.fn()
  },
  $transaction: jest.fn()
}));

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const db = require('../db.js');
const Comment = require('../models/Comment');
const app = require('../app.js');
const { getCsrfHeaders } = require('./csrf-test-helper.js');

describe('account erasure', () => {
  let server;
  let baseUrl;
  let uploadDirectory;
  let account;
  let products;
  let sessionCookie;
  const userId = 64;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'account-erasure-test-secret';
    process.env.JWT_ISSUER = 'e-commerce';
    process.env.JWT_AUDIENCE = 'e-commerce-api';
    process.env.MONGODB_URI = 'mongodb://localhost/test';
    uploadDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'api-account-erasure-'));
    process.env.UPLOAD_DIR = uploadDirectory;

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await fs.rm(uploadDirectory, { recursive: true, force: true });
    delete process.env.UPLOAD_DIR;
    delete process.env.MONGODB_URI;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    account = {
      id: userId,
      email: 'erase@example.test',
      name: 'Erase Me',
      password: await bcrypt.hash('correct-password', 10),
      totpEnabled: false,
      totpSecret: null
    };
    const imageName = '12345678-1234-1234-1234-123456789abc.jpg';
    products = [{
      id: 10,
      imageUrl: `/produits/images/${imageName}`,
      orderItems: [
        { order: { userId: account.id } },
        { order: { userId: 99 } }
      ]
    }, {
      id: 11,
      imageUrl: null,
      orderItems: [{ order: { userId: account.id } }]
    }];
    await fs.writeFile(path.join(uploadDirectory, imageName), 'image bytes');

    db.user.findUnique.mockImplementation(async ({ where, select }) => {
      if (!account || where.id !== account.id) return null;
      if (select?.role) return { id: account.id, role: 'user' };
      return { ...account, products };
    });
    db.revokedToken.findUnique.mockResolvedValue(null);
    db.order.deleteMany.mockResolvedValue({ count: 1 });
    db.product.updateMany.mockResolvedValue({ count: 1 });
    db.product.deleteMany.mockResolvedValue({ count: 1 });
    db.user.delete.mockImplementation(async () => {
      const deletedAccount = account;
      account = null;
      return deletedAccount;
    });
    db.$transaction.mockImplementation((operation) => operation(db));
    Comment.deleteMany.mockResolvedValue({ acknowledged: true, deletedCount: 1 });

    const token = jwt.sign(
      { id: account.id, email: account.email, role: 'user' },
      process.env.JWT_SECRET,
      {
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        jwtid: `erase-session-${Date.now()}`,
        expiresIn: '1h'
      }
    );
    sessionCookie = `session=${encodeURIComponent(token)}`;
  });

  it('deletes personal data and files while anonymizing seller products kept in other orders', async () => {
    const headers = await getCsrfHeaders(baseUrl, {
      Cookie: sessionCookie,
      'Content-Type': 'application/json'
    });
    const response = await fetch(`${baseUrl}/users/me`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ password: 'correct-password' })
    });

    expect(response.status).toBe(200);
    expect(Comment.deleteMany).toHaveBeenCalledWith({ userId });
    expect(await fs.readdir(uploadDirectory)).toEqual([]);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.order.deleteMany).toHaveBeenCalledWith({ where: { userId } });
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [10] }, vendeurId: userId },
      data: { vendeurId: null, imageUrl: null }
    });
    expect(db.product.deleteMany).toHaveBeenCalledWith({
      where: { vendeurId: userId, id: { notIn: [10] } }
    });
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: userId } });
    expect(response.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');

    const staleSessionResponse = await fetch(`${baseUrl}/users/me`, {
      headers: { Cookie: sessionCookie }
    });
    expect(staleSessionResponse.status).toBe(401);
  });

  it('requires the current password and leaves data untouched when it is wrong', async () => {
    const headers = await getCsrfHeaders(baseUrl, {
      Cookie: sessionCookie,
      'Content-Type': 'application/json'
    });
    const response = await fetch(`${baseUrl}/users/me`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ password: 'wrong-password' })
    });

    expect(response.status).toBe(401);
    expect(Comment.deleteMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(await fs.readdir(uploadDirectory)).toEqual(['12345678-1234-1234-1234-123456789abc.jpg']);
  });

  it('does not delete the account when the comments database is unavailable', async () => {
    const savedMongoUri = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;
    mongoose.connection.readyState = 0;
    try {
      const headers = await getCsrfHeaders(baseUrl, {
        Cookie: sessionCookie,
        'Content-Type': 'application/json'
      });
      const response = await fetch(`${baseUrl}/users/me`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ password: 'correct-password' })
      });

      expect(response.status).toBe(503);
      expect(account).not.toBeNull();
      expect(db.$transaction).not.toHaveBeenCalled();
    } finally {
      process.env.MONGODB_URI = savedMongoUri;
      mongoose.connection.readyState = 1;
    }
  });
});
