const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const IMAGE_TYPES = {
  '.jpg': {
    contentType: 'image/jpeg',
    matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  },
  '.jpeg': {
    contentType: 'image/jpeg',
    matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  },
  '.png': {
    contentType: 'image/png',
    matches: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  },
  '.webp': {
    contentType: 'image/webp',
    matches: (buffer) => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
  }
};

const getUploadDirectory = () => path.resolve(
  process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads')
);

const validateImage = (file) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const imageType = IMAGE_TYPES[extension];

  if (!imageType || !imageType.matches(file.buffer)) {
    const error = new Error('Type de fichier refusé. Formats acceptés : JPEG, PNG et WebP.');
    error.status = 400;
    throw error;
  }

  const canonicalExtension = imageType.contentType === 'image/jpeg' ? '.jpg' : extension;
  return { imageType, canonicalExtension };
};

const storeProductImage = async (file) => {
  const { imageType, canonicalExtension } = validateImage(file);
  const fileName = `${crypto.randomUUID()}${canonicalExtension}`;
  const directory = getUploadDirectory();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });

  try {
    await fs.writeFile(path.join(directory, fileName), file.buffer, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    throw new Error(`Impossible d’enregistrer l’image : ${error.message}`, { cause: error });
  }

  return {
    fileName,
    contentType: imageType.contentType,
    url: `/produits/images/${fileName}`
  };
};

const deleteProductImage = async (fileName) => {
  await fs.unlink(path.join(getUploadDirectory(), fileName));
};

const getProductImagePath = (fileName) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(fileName)) {
    return null;
  }
  return path.join(getUploadDirectory(), fileName);
};

const getStoredImageFileName = (imageUrl) => {
  if (typeof imageUrl !== 'string') return null;
  const match = /^\/produits\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp))$/i.exec(imageUrl);
  return match ? match[1] : null;
};

const getImageContentType = (fileName) => {
  if (fileName.endsWith('.jpg')) return 'image/jpeg';
  if (fileName.endsWith('.png')) return 'image/png';
  if (fileName.endsWith('.webp')) return 'image/webp';
  return null;
};

module.exports = {
  deleteProductImage,
  getImageContentType,
  getProductImagePath,
  getStoredImageFileName,
  storeProductImage
};
