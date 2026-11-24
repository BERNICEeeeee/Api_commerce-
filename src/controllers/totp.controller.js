const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const db = require('../db.js');
const {
  createOtpauthUrl,
  createRecoveryCode,
  createTotpSecret,
  decryptTotpSecret,
  encryptTotpSecret,
  verifyTotpCode
} = require('../middleware/totp.js');

const RECOVERY_CODE_COUNT = 10;

const verifyRecoveryCode = async (userId, suppliedCode) => {
  if (typeof suppliedCode !== 'string' || !/^[\da-f]{16}$/iu.test(suppliedCode)) return false;
  const records = await db.totpBackupCode.findMany({ where: { userId } });
  const matches = await Promise.all(records.map(async (record) => ({
    record,
    matches: await bcrypt.compare(suppliedCode.toUpperCase(), record.codeHash)
  })));
  const match = matches.find(({ matches: isMatch }) => isMatch);
  if (!match) return false;

  const deleted = await db.totpBackupCode.deleteMany({
    where: { id: match.record.id, userId }
  });
  return deleted.count === 1;
};

const verifyTotpOrRecoveryCode = async (user, { totpCode, recoveryCode }) => {
  if ((totpCode && recoveryCode) || (!totpCode && !recoveryCode)) return false;
  if (totpCode) {
    return verifyTotpCode(decryptTotpSecret(user.totpSecret), totpCode);
  }
  return verifyRecoveryCode(user.id, recoveryCode);
};

const startSetup = () => async (req, res, next) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, totpEnabled: true }
    });
    if (!user) return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
    if (user.totpEnabled) {
      return res.status(409).json({ erreur: 'La double authentification est déjà activée.' });
    }

    const secret = createTotpSecret();
    const otpauthUrl = createOtpauthUrl(secret, user.email);
    const qrCode = await QRCode.toDataURL(otpauthUrl);
    await db.user.update({
      where: { id: user.id },
      data: { totpSecret: encryptTotpSecret(secret), totpEnabled: false }
    });

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ secret, otpauthUrl, qrCode });
  } catch (error) {
    return next(error);
  }
};

const enable = () => async (req, res, next) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, totpEnabled: true, totpSecret: true }
    });
    if (!user || !user.totpSecret) {
      return res.status(400).json({ erreur: 'Commencez par demander un QR code.' });
    }
    if (user.totpEnabled) {
      return res.status(409).json({ erreur: 'La double authentification est déjà activée.' });
    }

    const { code } = req.body;
    if (!verifyTotpCode(decryptTotpSecret(user.totpSecret), code)) {
      return res.status(400).json({ erreur: 'Code TOTP invalide.' });
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, createRecoveryCode);
    const hashedRecoveryCodes = await Promise.all(
      recoveryCodes.map((recoveryCode) => bcrypt.hash(recoveryCode, 10))
    );
    await db.$transaction([
      db.totpBackupCode.deleteMany({ where: { userId: user.id } }),
      db.totpBackupCode.createMany({
        data: hashedRecoveryCodes.map((codeHash) => ({ userId: user.id, codeHash }))
      }),
      db.user.update({
        where: { id: user.id },
        data: { totpEnabled: true }
      })
    ]);

    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      message: 'Double authentification activée. Conservez ces codes de secours en lieu sûr.',
      recoveryCodes
    });
  } catch (error) {
    return next(error);
  }
};

const disable = () => async (req, res, next) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, password: true, totpEnabled: true, totpSecret: true }
    });
    if (!user || !user.totpEnabled || !user.totpSecret) {
      return res.status(409).json({ erreur: 'La double authentification n’est pas activée.' });
    }

    const { password, totpCode, recoveryCode } = req.body;
    if (typeof password !== 'string' || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ erreur: 'Identifiants invalides.' });
    }
    const recoveryLoginIsRecent = Number.isSafeInteger(req.user.mfaRecoveryUntil) &&
      req.user.mfaRecoveryUntil >= Math.floor(Date.now() / 1000);
    const suppliedFactor = Boolean(totpCode || recoveryCode);
    if (
      !(recoveryLoginIsRecent && !suppliedFactor) &&
      !(await verifyTotpOrRecoveryCode(user, { totpCode, recoveryCode }))
    ) {
      return res.status(401).json({ erreur: 'Code de vérification invalide.' });
    }

    await db.$transaction([
      db.totpBackupCode.deleteMany({ where: { userId: user.id } }),
      db.user.update({
        where: { id: user.id },
        data: { totpSecret: null, totpEnabled: false }
      })
    ]);
    return res.status(200).json({ message: 'Double authentification désactivée.' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  disable,
  enable,
  startSetup,
  verifyTotpOrRecoveryCode
};
