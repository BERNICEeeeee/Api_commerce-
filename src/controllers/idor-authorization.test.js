jest.mock('../db.js', () => ({
  user: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  revokedToken: {
    findUnique: jest.fn()
  },
  orderItem: {
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
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

describe('resource ownership and mass assignment', () => {
  let server;
  let baseUrl;
  const cartItem = {
    id: 501,
    ownerId: 101,
    orderId: 701,
    productId: 42,
    quantity: 1,
    price: 12.5
  };

  const sessionCookie = (userId) => {
    const token = jwt.sign(
      { id: userId, role: 'user' },
      process.env.JWT_SECRET,
      {
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        jwtid: `idor-user-${userId}`,
        expiresIn: '1h'
      }
    );
    return `session=${encodeURIComponent(token)}`;
  };

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
    db.user.findUnique.mockImplementation(async ({ where }) => (
      where.id ? { id: where.id, role: 'user' } : null
    ));
    db.revokedToken.findUnique.mockResolvedValue(null);
    db.orderItem.findFirst.mockImplementation(async ({ where }) => (
      where.order?.userId === cartItem.ownerId ? cartItem : null
    ));
    db.orderItem.update.mockResolvedValue(cartItem);
    db.orderItem.delete.mockResolvedValue(cartItem);
    db.user.update.mockImplementation(async ({ where, data }) => ({
      id: where.id,
      role: 'user',
      banned: false,
      email: 'owner@example.test',
      ...data
    }));
  });

  it('does not let another account modify an owned cart line by changing its ID', async () => {
    const otherUserCookie = sessionCookie(202);
    const foreignUpdate = await fetch(`${baseUrl}/panier/modifier/${cartItem.id}`, {
      method: 'PATCH',
      headers: await getCsrfHeaders(baseUrl, {
        Cookie: otherUserCookie,
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({ quantity: 99 })
    });
    const foreignDelete = await fetch(`${baseUrl}/panier/delete/${cartItem.id}`, {
      method: 'DELETE',
      headers: await getCsrfHeaders(baseUrl, { Cookie: otherUserCookie })
    });

    expect(foreignUpdate.status).toBe(404);
    expect(foreignDelete.status).toBe(404);
    expect(db.orderItem.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: cartItem.id,
        order: { userId: 202, status: 'pending' }
      }
    });
    expect(db.orderItem.update).not.toHaveBeenCalled();
    expect(db.orderItem.delete).not.toHaveBeenCalled();

    const ownerUpdate = await fetch(`${baseUrl}/panier/modifier/${cartItem.id}`, {
      method: 'PATCH',
      headers: await getCsrfHeaders(baseUrl, {
        Cookie: sessionCookie(cartItem.ownerId),
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({ quantity: 2 })
    });

    expect(ownerUpdate.status).toBe(200);
    expect(db.orderItem.update).toHaveBeenCalledWith({
      where: { id: cartItem.id },
      data: { quantity: 2 }
    });

    const ownerDelete = await fetch(`${baseUrl}/panier/delete/${cartItem.id}`, {
      method: 'DELETE',
      headers: await getCsrfHeaders(baseUrl, {
        Cookie: sessionCookie(cartItem.ownerId)
      })
    });

    expect(ownerDelete.status).toBe(200);
    expect(db.orderItem.delete).toHaveBeenCalledWith({ where: { id: cartItem.id } });
  });

  it('rejects mass assignment of profile ownership and privilege fields', async () => {
    const response = await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: await getCsrfHeaders(baseUrl, {
        Cookie: sessionCookie(101),
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        name: 'Updated name',
        id: 202,
        userId: 202,
        role: 'admin',
        banned: true
      })
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ erreur: 'Champ de profil non autorisé.' });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('updates the authenticated profile using only allowed fields', async () => {
    const response = await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: await getCsrfHeaders(baseUrl, {
        Cookie: sessionCookie(101),
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({ name: 'Updated name' })
    });

    expect(response.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 101 },
      data: { name: 'Updated name' }
    });
  });
});
