const multer = require('multer');

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const parseImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 1,
    fields: 4,
    fieldSize: 16 * 1024
  }
}).single('image');

const uploadProductImage = (req, res, next) => {
  parseImage(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ erreur: 'L’image dépasse la taille maximale de 5 Mo.' });
    }

    if (error instanceof multer.MulterError) {
      return res.status(400).json({ erreur: 'Fichier image invalide.' });
    }

    return next(error);
  });
};

module.exports = { MAX_IMAGE_SIZE, uploadProductImage };
