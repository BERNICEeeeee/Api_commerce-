const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const NONCE_LENGTH = 12; // 96 bits recommandé pour GCM

function getKey() {
  const rawKey = process.env.TOTP_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('Clé de chiffrement manquante (TOTP_ENCRYPTION_KEY).');
  }
  const key = Buffer.from(rawKey, 'base64');
  if (key.length !== 32) {
    throw new Error('TOTP_ENCRYPTION_KEY doit faire exactement 32 octets encodés en base64.');
  }
  return key;
}

// Chiffre un texte -> renvoie "nonce:tag:texteChiffre" en base64
function encryptValue(plainText) {
  const key = getKey();
  const nonce = crypto.randomBytes(NONCE_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);

  const encrypted = Buffer.concat([
    cipher.update(String(plainText), 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return [
    nonce.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64')
  ].join(':');
}

// Déchiffre une valeur au format "nonce:tag:texteChiffre"
function decryptValue(payload) {
  const key = getKey();
  const parts = String(payload).split(':');
  if (parts.length !== 3) {
    throw new Error('Format de donnée chiffrée invalide.');
  }

  const [nonceB64, tagB64, dataB64] = parts;
  const nonce = Buffer.from(nonceB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

module.exports = { encryptValue, decryptValue };