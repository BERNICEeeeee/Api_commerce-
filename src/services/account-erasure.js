const mongoose = require('mongoose');
const Comment = require('../models/Comment');
const { deleteProductImage, getStoredImageFileName } = require('./product-images.js');

const connectCommentsDatabase = async () => {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGODB_URI) {
    const error = new Error('La suppression du compte nécessite MONGODB_URI pour effacer ses commentaires.');
    error.status = 503;
    error.expose = true;
    throw error;
  }

  try {
    if (mongoose.connection.readyState === 2) {
      await mongoose.connection.asPromise();
    } else {
      await mongoose.connect(process.env.MONGODB_URI);
    }
  } catch (cause) {
    const error = new Error('La base des commentaires est indisponible ; le compte n’a pas été supprimé.', { cause });
    error.status = 503;
    error.expose = true;
    throw error;
  }
};

const eraseUserComments = async (userId) => {
  await connectCommentsDatabase();
  await Comment.deleteMany({ userId });
};

const deleteUserProductImages = async (products) => {
  for (const product of products) {
    const fileName = getStoredImageFileName(product.imageUrl);
    if (!fileName) continue;

    try {
      await deleteProductImage(fileName);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
};

module.exports = { deleteUserProductImages, eraseUserComments };
