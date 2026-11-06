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

Les résultats générés sont intégrés au projet et ont été vérifiés et adaptés à son code et à ses besoins.

## Sécurité

### Flux et frontières de confiance

```text
 FRONTIÈRE 1 — clients non fiables
 [Navigateur / application cliente]
        | HTTPS en production ; requêtes HTTP locales en développement
        | JSON, paramètres d'URL et jeton Bearer dans Authorization
        v
 FRONTIÈRE 2 — serveur de l'application
 [Express : /auth, /users, /produits, /panier, /comments, /docs]
        | Prisma
        +--------------------------> [PostgreSQL : comptes, produits, commandes]
        | Mongoose
        +--------------------------> [MongoDB : commentaires]
                                    (connexion prévue, non activée au démarrage)

 FRONTIÈRE 3 — chaîne de dépendances
 [package.json / package-lock.json] -> npm ci -> dépendances exécutées par l'API
```

Le client et toutes les données qu'il envoie sont considérés comme non fiables.
L'API vérifie les jetons Bearer et certaines routes contrôlent aussi le rôle.
Les bases de données sont des services distincts qui doivent rester accessibles
uniquement depuis les composants autorisés. En production, le trafic public doit
passer par HTTPS.

### Surfaces d'entrée

| Surface | Présence dans le projet |
| --- | --- |
| Formulaires | Aucun formulaire ou frontend n'est fourni. Les données de formulaire éventuelles arrivent à l'API sous forme de JSON. |
| URL | Routes et paramètres de chemin, par exemple `/produits/:id` et `/comments/:productId`. |
| Cookies | Aucun cookie n'est lu ni utilisé pour l'authentification ; le jeton est transmis dans l'en-tête `Authorization: Bearer`. |
| Fichiers | Aucun téléversement de fichier n'est implémenté. Le serveur lit notamment `docs/openapi.yaml` au démarrage ; `.env` contient la configuration locale. |
| API | Corps JSON des requêtes d'inscription, connexion, profil, produits, panier et commentaires ; en-têtes HTTP, dont le jeton Bearer. `/docs` expose Swagger. |
| Dépendances | Paquets npm déclarés dans `package.json` et verrouillés dans `package-lock.json`, installés avec `npm ci` et chargés par le serveur. |

### Menaces principales

| Priorité | Menace | Première mesure de parade |
| --- | --- | --- |
| Haute | **Falsification de jetons si `JWT_SECRET` est absent** : le code utilise alors la valeur connue `dev-secret`, ce qui peut permettre de fabriquer des jetons acceptés par l'API. | Refuser de démarrer en production si le secret manque ; fournir un secret aléatoire robuste via le gestionnaire de secrets et le renouveler en cas d'exposition. |
| Haute | **Divulgation de données personnelles** : les réponses publiques du catalogue et du détail produit incluent l'adresse e-mail du vendeur. | Ne renvoyer que les champs du vendeur destinés à être publics, par exemple son identifiant et son nom. |
| Moyenne | **Essais automatisés et abus des comptes** : l'inscription et la connexion ne montrent pas de limitation de débit ; des requêtes répétées peuvent viser les mots de passe ou créer des comptes en masse. | Ajouter une limitation de débit et une surveillance sur les routes d'authentification, ainsi qu'une politique de mot de passe adaptée. |
| Moyenne | **Abus ou obsolescence des autorisations** : l'inscription accepte le rôle `vendeur`, et les jetons contiennent un rôle avec une durée de validité de sept jours ; les changements de rôle ne sont pas répercutés dans un jeton déjà émis. | Si l'inscription vendeur doit être approuvée, retirer ce choix de l'inscription publique ; vérifier le statut et les droits actuels côté serveur, et prévoir des jetons plus courts ou révocables. |
| Moyenne | **Compromission via une dépendance** : une dépendance npm vulnérable ou compromise s'exécute dans le processus de l'API. | Conserver le lockfile, examiner les mises à jour, lancer régulièrement `npm audit` et corriger les vulnérabilités pertinentes avant déploiement. |

Ces priorités sont une première évaluation à partir du code et de sa configuration,
pas un audit de sécurité exhaustif. Les mesures proposées restent à mettre en œuvre
et à vérifier avant une exposition en production.
