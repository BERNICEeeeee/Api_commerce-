jest.mock('../db.js', () => ({
  user: {
    findUnique: jest.fn()
  },
  product: {
    findUnique: jest.fn()
  },
  revokedToken: {
    findUnique: jest.fn()
  }
}));

jest.mock('../models/Comment', () => ({
  create: jest.fn()
}));

const db = require('../db.js');
const Comment = require('../models/Comment');
const jwt = require('jsonwebtoken');
const { getCsrfHeaders } = require('./csrf-test-helper.js');

let app;
let server;
let baseUrl;
let sessionCookie;

describe('user text output', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_ISSUER = 'e-commerce';
    process.env.JWT_AUDIENCE = 'e-commerce-api';
    app = require('../app.js');
    const token = jwt.sign(
      { id: 5, role: 'user' },
      process.env.JWT_SECRET,
      { issuer: process.env.JWT_ISSUER, audience: process.env.JWT_AUDIENCE, jwtid: 'test-client', expiresIn: '1h' }
    );
    sessionCookie = `session=${encodeURIComponent(token)}`;
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
    db.revokedToken.findUnique.mockResolvedValue(null);
  });

  it('escapes HTML characters in the HTTP JSON response and preserves the text after parsing', async () => {
    const content = '<img src=x onerror=alert(1)>';
    const savedComment = { content };

    db.user.findUnique.mockResolvedValue({
      id: 5,
      role: 'user',
      banned: false,
      name: 'Client'
    });
    db.product.findUnique.mockResolvedValue({ id: 7 });
    Comment.create.mockResolvedValue(savedComment);

    const response = await fetch(`${baseUrl}/comments/7`, {
      method: 'POST',
      headers: await getCsrfHeaders(baseUrl, {
        Cookie: sessionCookie,
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({ content, rating: 4 })
    });
    const rawResponse = await response.text();

    expect(Comment.create).toHaveBeenCalledWith({
      productId: 7,
      userId: 5,
      userName: 'Client',
      content,
      rating: 4
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(rawResponse).toContain('\\u003cimg src=x onerror=alert(1)\\u003e');
    expect(rawResponse).not.toContain(content);
    expect(JSON.parse(rawResponse)).toEqual({
      message: 'Commentaire ajouté.',
      comment: savedComment
    });
  });
});
