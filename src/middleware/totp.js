const crypto = require('node:crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

const getEncryptionKey = () => {
  const configuredKey = process.env.TOTP_ENCRYPTION_KEY;
  if (!configuredKey) {
    throw new Error('TOTP_ENCRYPTION_KEY must be configured to use MFA.');
  }

  const key = /^[\da-f]{64}$/i.test(configuredKey)
    ? Buffer.from(configuredKey, 'hex')
    : Buffer.from(configuredKey, 'base64');
  if (key.length !== 32) {
    throw new Error('TOTP_ENCRYPTION_KEY must encode exactly 32 bytes.');
  }
  return key;
};

const encodeBase32 = (value) => {
  let bits = 0;
  let accumulator = 0;
  let encoded = '';

  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += BASE32_ALPHABET[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) encoded += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31];
  return encoded;
};

const decodeBase32 = (value) => {
  let bits = 0;
  let accumulator = 0;
  const bytes = [];

  for (const character of value.toUpperCase().replace(/=+$/u, '')) {
    const digit = BASE32_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error('Invalid Base32 TOTP secret.');
    accumulator = (accumulator << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

const createTotpSecret = () => encodeBase32(crypto.randomBytes(20));

const encryptTotpSecret = (secret) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url')
  ].join('.');
};

const decryptTotpSecret = (encryptedSecret) => {
  const [version, ivValue, tagValue, ciphertextValue, ...extra] = encryptedSecret.split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !ciphertextValue || extra.length > 0) {
    throw new Error('Stored TOTP secret has an invalid format.');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivValue, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final()
  ]).toString('utf8');
};

const createTotpCode = (secret, timestamp = Date.now()) => {
  const counter = Math.floor(timestamp / 1000 / TOTP_PERIOD_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, '0');
};

const verifyTotpCode = (secret, suppliedCode, timestamp = Date.now()) => {
  if (typeof suppliedCode !== 'string' || !/^\d{6}$/u.test(suppliedCode)) return false;
  for (const step of [-1, 0, 1]) {
    const expectedCode = createTotpCode(secret, timestamp + step * TOTP_PERIOD_SECONDS * 1000);
    const expected = Buffer.from(expectedCode);
    const supplied = Buffer.from(suppliedCode);
    if (crypto.timingSafeEqual(expected, supplied)) return true;
  }
  return false;
};

const createRecoveryCode = () => crypto.randomBytes(8).toString('hex').toUpperCase();

const createOtpauthUrl = (secret, email) => {
  const issuer = 'Api Commerce';
  const label = `${issuer}:${email}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS)
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params}`;
};

module.exports = {
  createOtpauthUrl,
  createRecoveryCode,
  createTotpCode,
  createTotpSecret,
  decryptTotpSecret,
  encryptTotpSecret,
  verifyTotpCode
};
