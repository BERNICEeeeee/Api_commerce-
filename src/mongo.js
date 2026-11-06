const mongoose = require('mongoose');

const connectMongo = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(' Connecté à MongoDB pour les commentaires');
  } catch (error) {
    console.error(' Erreur de connexion MongoDB :', error);
  }
};

module.exports = connectMongo;