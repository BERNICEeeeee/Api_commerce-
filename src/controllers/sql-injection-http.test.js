jest.mock('../db.js', () => ({
  user: {
    findUnique: jest.fn()
  },
  product: {
    findUnique: jest.fn(),
    findMany: jest.fn()
  }
}));

const db = require('../db.js');
const app = require('../app.js');
const bcrypt = require('bcryptjs');
const { getCsrfHeaders } = require('./csrf-test-helper.js');

describe('SQL injection HTTP regression', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
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
  });

  it('returns the same generic response for an unknown email and a wrong password', async () => {
    const email = "' OR '1'='1";
    const password = 'mot-de-passe-test';
    const wrongPasswordHash = await bcrypt.hash('un-autre-mot-de-passe', 10);
    db.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 8,
        email,
        password: wrongPasswordHash,
        name: 'Compte de test',
        role: 'user'
      });

    const sendLogin = async () => {
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: await getCsrfHeaders(baseUrl, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email, password })
      });
      return { status: response.status, body: await response.json() };
    };

    const unknownAccount = await sendLogin();
    const wrongPassword = await sendLogin();

    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email } });
    expect(unknownAccount).toEqual({
      status: 401,
      body: { erreur: 'Identifiants invalides.' }
    });
    expect(wrongPassword).toEqual(unknownAccount);
  });
});
