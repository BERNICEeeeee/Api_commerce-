# Utiliser une image officielle Node.js (version LTS)
FROM node:22-alpine

# Définir le répertoire de travail dans le conteneur
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances du projet
RUN npm install

# Copier le reste du code source de l'application
COPY . .

# Generate Prisma Client without requiring the runtime database credentials.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

# Exposer le port sur lequel tourne Express (ex: 3000)
EXPOSE 3000

# Commande pour lancer l'application
CMD ["npm", "start"]