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

Dans ce fichier, faites pointer `DATABASE_URL` vers `api_app` et ajoutez les
variables des rôles et de migration suivantes :

```dotenv
DATABASE_URL=postgresql://api_app:mot-de-passe-app@localhost:5432/mon_projet_db?schema=public
DATABASE_MIGRATION_URL=postgresql://api_migrator:mot-de-passe-migration@localhost:5432/mon_projet_db?schema=public
APP_DB_USER=api_app
APP_DB_PASSWORD=mot-de-passe-app
MIGRATION_DB_USER=api_migrator
MIGRATION_DB_PASSWORD=mot-de-passe-migration
POSTGRES_ADMIN_PASSWORD=mot-de-passe-admin-local
```

`DATABASE_URL` doit pointer vers une base PostgreSQL accessible. Pour Docker
Compose, utilisez le compte applicatif `api_app` dans `DATABASE_URL` et le compte
`api_migrator` dans `DATABASE_MIGRATION_URL`. Prisma CLI privilégie
`DATABASE_MIGRATION_URL` ; l'API utilise `DATABASE_URL`. Le compte bootstrap
PostgreSQL n'est utilisé que par le conteneur de base de données.

Les scripts de création des rôles s'exécutent automatiquement uniquement lors
de l'initialisation d'un volume neuf. Pour un volume Docker déjà initialisé,
mettez à jour le service `db`, puis exécutez une fois
`docker compose exec db sh /docker-entrypoint-initdb.d/01-create-roles.sh`.
Cette opération ne supprime pas le volume existant.

Après le démarrage de PostgreSQL, vérifiez les attributs du rôle applicatif :

```bash
docker compose exec db psql -U postgres -d mon_projet_db -c "SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, has_schema_privilege(rolname, 'public', 'CREATE') AS can_create_objects FROM pg_roles WHERE rolname = 'api_app';"
```

Les quatre colonnes de privilèges doivent être à `false`.

Appliquez les migrations du projet et générez Prisma Client :

```bash
npx prisma migrate deploy
npx prisma generate
```

`MONGODB_URI` est l'URI de la base MongoDB utilisée par le module de commentaires. La fonction de connexion MongoDB existe dans le projet, mais n'est pas appelée automatiquement au démarrage du serveur ; la connexion doit être activée dans le code pour utiliser les routes de commentaires.

## Variables d'environnement

| Variable | Description | Valeur par défaut |
| --- | --- | --- |
| `PORT` | Port HTTP de l'API | `8000` |
| `DATABASE_URL` | URL PostgreSQL du rôle applicatif (lecture/écriture des données) | Aucune |
| `DATABASE_MIGRATION_URL` | URL PostgreSQL du rôle Prisma migrations, utilisée par la CLI | `DATABASE_URL` |
| `UPLOAD_DIR` | Dossier privé de stockage des images produit | `uploads` à la racine du projet |
| `APP_DB_USER` / `APP_DB_PASSWORD` | Identifiants du rôle applicatif Docker | Aucune |
| `MIGRATION_DB_USER` / `MIGRATION_DB_PASSWORD` | Identifiants du rôle migrations Docker | Aucune |
| `POSTGRES_ADMIN_PASSWORD` | Mot de passe du compte bootstrap PostgreSQL dans Docker | Aucune |
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

L'ajout d'un produit accepte un champ de fichier `image` (JPEG, PNG ou WebP,
maximum 5 Mo) dans une requête `multipart/form-data`. Le serveur vérifie à la
fois l'extension et la signature réelle du fichier, génère son propre nom et le
stocke dans `UPLOAD_DIR`, hors du contenu servi comme pages publiques. Les
fichiers `.php`, `.svg` et les scripts renommés en `.jpg` sont refusés. Les images
sont disponibles via `/produits/images/:fileName`, toujours en pièce jointe avec
`X-Content-Type-Options: nosniff`. `imageUrl` reste accepté pour compatibilité,
mais ne peut pas être envoyé en même temps que `image`.

Exemple d'envoi (remplacez le jeton et le chemin de l'image) :

```bash
curl -X POST http://localhost:8000/produits/ajouter \
  -H "Authorization: Bearer VOTRE_JETON" \
  -F "name=Mon produit" \
  -F "price=12.50" \
  -F "image=@photo.jpg"
```

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
| Fichiers | Images produit reçues en multipart, vérifiées et enregistrées dans `UPLOAD_DIR`, hors du dossier public ; téléchargées en pièce jointe. Le serveur lit aussi `docs/openapi.yaml` au démarrage. |
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

### Tests des entrées SQL

Lancez les tests unitaires avec `npm test`. Ils vérifient qu'une valeur d'injection
envoyée au login ou à la recherche reste une valeur de filtre Prisma et n'élargit
pas les résultats, et qu'un identifiant produit invalide est rejeté avant toute
requête. Ces tests mockent Prisma : ils vérifient le comportement des contrôleurs,
mais ne remplacent pas un test d'intégration contre PostgreSQL.

La recherche est disponible via `GET /produits/recherche?q=texte`. Elle cherche,
sans tenir compte de la casse, dans le nom et la description des produits.

### Affichage du texte utilisateur et CSP

L'API renvoie les noms, descriptions et commentaires comme des chaînes dans des
réponses JSON, avec le type `application/json` ; elle ne produit pas de HTML à
partir de ces textes. Le frontend doit les afficher comme du texte (`textContent`
ou l'interpolation échappée du framework) et éviter `innerHTML`. Aucun HTML riche
n'est requis par cette API ; ne pas transformer ces champs en HTML.

Une politique CSP restrictive est envoyée sur les réponses de l'API. La page
Swagger a une politique séparée qui autorise les scripts et styles inline
nécessaires à Swagger UI, tout en limitant les ressources à la même origine.
`npm test` vérifie les en-têtes de sécurité de l'API et de Swagger. Il n'y a pas
de frontend dans ce dépôt pour vérifier le rendu visuel d'une charge XSS.
