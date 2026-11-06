# API E-commerce

API REST de commerce en ligne développée avec Node.js et Express. Elle propose l'authentification, la gestion des utilisateurs, un catalogue de produits, un panier et des commentaires.

## Prérequis

- Node.js `22.13.0` ou supérieur
- npm
- PostgreSQL pour les utilisateurs, produits, commandes et paniers
- MongoDB pour le stockage des commentaires

## Installation

```bash
npm ci
```

Créez un fichier `.env` à la racine du projet et renseignez les variables nécessaires :

```dotenv
PORT=8000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/api_commerce?schema=public"
JWT_SECRET="remplacer-par-une-cle-secrete"
JWT_ISSUER="e-commerce"
JWT_AUDIENCE="e-commerce-api"
MONGODB_URI="mongodb://localhost:27017/api_commerce"
```

`DATABASE_URL` doit pointer vers une base PostgreSQL accessible. Appliquez les migrations du projet et générez Prisma Client :

```bash
npx prisma migrate deploy
npx prisma generate
```

`MONGODB_URI` est l'URI de la base MongoDB utilisée par le module de commentaires. La fonction de connexion MongoDB existe dans le projet, mais n'est pas appelée automatiquement au démarrage du serveur ; la connexion doit être activée dans le code pour utiliser les routes de commentaires.

## Variables d'environnement

| Variable | Description | Valeur par défaut |
| --- | --- | --- |
| `PORT` | Port HTTP de l'API | `8000` |
| `DATABASE_URL` | URL de connexion PostgreSQL utilisée par Prisma | Aucune |
| `JWT_SECRET` | Clé de signature des jetons JWT | `dev-secret` |
| `JWT_ISSUER` | Émetteur des jetons JWT | `e-commerce` |
| `JWT_AUDIENCE` | Audience des jetons JWT | `e-commerce-api` |
| `MONGODB_URI` | URL de connexion MongoDB pour les commentaires | Aucune |

En dehors du développement, configurez impérativement une valeur `JWT_SECRET` robuste et gardez le fichier `.env` hors du contrôle de version.

## Lancement

Mode développement (redémarrage automatique à la modification des fichiers) :

```bash
npm run dev
```

Mode standard :

```bash
npm start
```

Par défaut, l'API est disponible à l'adresse `http://localhost:8000`.

## Documentation et routes

- Interface Swagger : [http://localhost:8000/docs](http://localhost:8000/docs)
- Spécification OpenAPI au format JSON : [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json)
- Spécification source : [`docs/openapi.yaml`](docs/openapi.yaml)

Les principales ressources sont accessibles sous `/auth`, `/users`, `/produits`, `/panier` et `/comments`. Les opérations protégées nécessitent un jeton JWT ; certaines sont réservées à un rôle particulier. Les méthodes, paramètres et formats de requête sont détaillés dans Swagger.

## Utilisation de l'IA

L'IA a été utilisée comme aide au développement, notamment pour :

- créer la spécification OpenAPI dans `docs/openapi.yaml` ;
- élaborer des contrôleurs à partir des routes, des modèles, des middlewares et des descriptions fonctionnelles du projet.

Les résultats générés sont intégrés au projet et doivent être vérifiés et adaptés à son code et à ses besoins.
