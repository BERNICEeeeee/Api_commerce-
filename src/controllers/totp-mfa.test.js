jest.mock('../db.js', () => ({
  user: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  revokedToken: {
    findUnique: jest.fn()
  },
  totpBackupCode: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn()
  },
  $transaction: jest.fn()
}));

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db.js');
const app = require('../app.js');
const { getCsrfHeaders } = require('./csrf-test-helper.js');
const {
  createTotpCode,
  decryptTotpSecret,
  verifyTotpCode
} = require('../middleware/totp.js');

describe('TOTP multi-factor authentication', () => {
  let server;
  let baseUrl;
  let user;
  let backupCodes;
  let sessionCookie;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'totp-test-jwt-secret';
    process.env.JWT_ISSUER = 'e-commerce';
    process.env.JWT_AUDIENCE = 'e-commerce-api';
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    delete process.env.TOTP_ENCRYPTION_KEY;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    backupCodes = [];
    user = {
      id: 41,
      email: 'totp@example.test',
      name: 'TOTP User',
      role: 'user',
      banned: false,
      password: await bcrypt.hash('correct-password', 10),
      totpSecret: null,
      totpEnabled: false
    };
    db.user.findUnique.mockImplementation(async ({ where }) => (
      where.id === user.id || where.email === user.email ? { ...user } : null
    ));
    db.user.update.mockImplementation(async ({ data }) => Object.assign(user, data));
    db.revokedToken.findUnique.mockResolvedValue(null);
    db.totpBackupCode.findMany.mockImplementation(async () => backupCodes.map((record) => ({ ...record })));
    db.totpBackupCode.deleteMany.mockImplementation(async ({ where }) => {
      const previousLength = backupCodes.length;
      backupCodes = backupCodes.filter((record) => (
        record.userId !== where.userId || (where.id && record.id !== where.id)
      ));
      return { count: previousLength - backupCodes.length };
    });
    db.totpBackupCode.createMany.mockImplementation(async ({ data }) => {
      backupCodes.push(...data.map((record, index) => ({ id: index + 1, ...record })));
      return { count: data.length };
    });
    db.$transaction.mockImplementation(async (operations) => Promise.all(operations));

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      {
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        jwtid: `totp-session-${Date.now()}`,
        expiresIn: '1h'
      }
    );
    sessionCookie = `session=${encodeURIComponent(token)}`;
  });

  const post = async (path, body, cookie = sessionCookie) => {
    const headers = await getCsrfHeaders(baseUrl, {
      Cookie: cookie,
      'Content-Type': 'application/json'
    });
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
  };

  it('accepts one TOTP interval of clock drift and rejects two intervals', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const timestamp = 600_000;

    expect(verifyTotpCode(secret, createTotpCode(secret, timestamp - 30_000), timestamp)).toBe(true);
    expect(verifyTotpCode(secret, createTotpCode(secret, timestamp + 30_000), timestamp)).toBe(true);
    expect(verifyTotpCode(secret, createTotpCode(secret, timestamp + 60_000), timestamp)).toBe(false);
  });

  it('creates a QR code, enables only after the first valid code, and requires TOTP at login', async () => {
    const setupResponse = await post('/auth/totp/setup', {});
    const setup = await setupResponse.json();

    expect(setupResponse.status).toBe(200);
    expect(setup.qrCode).toMatch(/^data:image\/png;base64,/u);
    expect(setup.otpauthUrl).toContain(encodeURIComponent(user.email));
    expect(user.totpSecret).not.toContain(setup.secret);
    expect(decryptTotpSecret(user.totpSecret)).toBe(setup.secret);
    expect(user.totpEnabled).toBe(false);

    const invalidConfirmation = await post('/auth/totp/enable', { code: '000000' });
    expect(invalidConfirmation.status).toBe(400);

    const enabledResponse = await post('/auth/totp/enable', {
      code: createTotpCode(setup.secret)
    });
    const enabled = await enabledResponse.json();

    expect(enabledResponse.status).toBe(200);
    expect(user.totpEnabled).toBe(true);
    expect(enabled.recoveryCodes).toHaveLength(10);
    expect(backupCodes).toHaveLength(10);
    expect(backupCodes.every(({ codeHash }) => codeHash.startsWith('$2'))).toBe(true);
    expect(await bcrypt.compare(enabled.recoveryCodes[0], backupCodes[0].codeHash)).toBe(true);

    const missingCodeResponse = await post('/auth/login', {
      email: user.email,
      password: 'correct-password'
    }, '');
    expect(missingCodeResponse.status).toBe(401);
    expect(missingCodeResponse.headers.get('set-cookie')).toBeNull();

    const loginResponse = await post('/auth/login', {
      email: user.email,
      password: 'correct-password',
      totpCode: createTotpCode(setup.secret)
    }, '');
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.headers.get('set-cookie')).toContain('session=');
    expect(JSON.stringify(await loginResponse.json())).not.toContain(setup.secret);
  });

  it('allows a one-time recovery code to log in and disable MFA after phone loss', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    user.totpSecret = require('../middleware/totp.js').encryptTotpSecret(secret);
    user.totpEnabled = true;
    const recoveryCode = 'A1B2C3D4E5F60708';
    backupCodes = [{
      id: 1,
      userId: user.id,
      codeHash: await bcrypt.hash(recoveryCode, 10)
    }, {
      id: 2,
      userId: user.id,
      codeHash: await bcrypt.hash('1111222233334444', 10)
    }];

    const loginResponse = await post('/auth/login', {
      email: user.email,
      password: 'correct-password',
      recoveryCode
    }, '');
    expect(loginResponse.status).toBe(200);
    expect(backupCodes).toHaveLength(1);

    const reusedCodeResponse = await post('/auth/login', {
      email: user.email,
      password: 'correct-password',
      recoveryCode
    }, '');
    expect(reusedCodeResponse.status).toBe(401);
    expect(reusedCodeResponse.headers.get('set-cookie')).toBeNull();
    expect(backupCodes).toHaveLength(1);

    const recoverySession = loginResponse.headers.get('set-cookie').split(';', 1)[0];

    const disableResponse = await post('/auth/totp/disable', {
      password: 'correct-password'
    }, recoverySession);
    expect(disableResponse.status).toBe(200);
    expect(user.totpEnabled).toBe(false);
    expect(user.totpSecret).toBeNull();
    expect(backupCodes).toHaveLength(0);
  });
});
