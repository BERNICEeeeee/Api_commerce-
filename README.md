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
COOKIE_SECURE=false
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/api_commerce?schema=public"
JWT_SECRET="remplacer-par-une-cle-secrete"
JWT_ISSUER="e-commerce"
JWT_AUDIENCE="e-commerce-api"
TOTP_ENCRYPTION_KEY="cle-aleatoire-de-32-octets-en-base64"
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
| `COOKIE_SECURE` | Force l'attribut `Secure` du cookie de session, notamment pour un test local en HTTPS | `false` (activé en production) |
| `CSRF_SECRET` | Clé dédiée à la signature des jetons CSRF | `JWT_SECRET` |
| `APP_ORIGIN` | Origine publique de l'API pour le contrôle Origin derrière un proxy HTTPS | Origine de la requête |
| `DATABASE_URL` | URL PostgreSQL du rôle applicatif (lecture/écriture des données) | Aucune |
| `DATABASE_MIGRATION_URL` | URL PostgreSQL du rôle Prisma migrations, utilisée par la CLI | `DATABASE_URL` |
| `UPLOAD_DIR` | Dossier privé de stockage des images produit | `uploads` à la racine du projet |
| `APP_DB_USER` / `APP_DB_PASSWORD` | Identifiants du rôle applicatif Docker | Aucune |
| `MIGRATION_DB_USER` / `MIGRATION_DB_PASSWORD` | Identifiants du rôle migrations Docker | Aucune |
| `POSTGRES_ADMIN_PASSWORD` | Mot de passe du compte bootstrap PostgreSQL dans Docker | Aucune |
| `JWT_SECRET` | Clé de signature des jetons JWT | `dev-secret` |
| `JWT_ISSUER` | Émetteur des jetons JWT | `e-commerce` |
| `JWT_AUDIENCE` | Audience des jetons JWT | `e-commerce-api` |
| `TOTP_ENCRYPTION_KEY` | Clé Base64 ou hexadécimale de 32 octets pour chiffrer les secrets TOTP en base | Aucune (requise pour activer le MFA) |
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

Les principales ressources sont accessibles sous `/auth`, `/users`, `/produits`, `/panier` et `/comments`. Les opérations protégées nécessitent le cookie de session qui contient le JWT ; certaines sont réservées à un rôle particulier. Les méthodes, paramètres et formats de requête sont détaillés dans Swagger. Les routes d'administration sont regroupées sous `/users/admin` et contrôlées côté serveur.

L'ajout d'un produit accepte un champ de fichier `image` (JPEG, PNG ou WebP,
maximum 5 Mo) dans une requête `multipart/form-data`. Le serveur vérifie à la
fois l'extension et la signature réelle du fichier, génère son propre nom et le
stocke dans `UPLOAD_DIR`, hors du contenu servi comme pages publiques. Les
fichiers `.php`, `.svg` et les scripts renommés en `.jpg` sont refusés. Les images
sont disponibles via `/produits/images/:fileName`, toujours en pièce jointe avec
`X-Content-Type-Options: nosniff`. `imageUrl` reste accepté pour compatibilité,
mais ne peut pas être envoyé en même temps que `image`.

Récupérez d'abord un jeton CSRF et gardez le cookie reçu, puis envoyez le jeton
dans `X-CSRF-Token` avec le cookie de session :

```js
const csrfResponse = await fetch('http://localhost:8000/auth/csrf', {
  credentials: 'include'
});
const { csrfToken } = await csrfResponse.json();

await fetch('http://localhost:8000/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken
  },
  body: JSON.stringify({ email: 'user@example.test', password: 'votre-mot-de-passe' })
});
```

## Utilisation de l'IA

L'IA a été utilisée comme aide au développement, notamment pour :

- créer la spécification OpenAPI dans `docs/openapi.yaml` ;
- élaborer des contrôleurs à partir des routes, des modèles, des middlewares et des descriptions fonctionnelles du projet.

Les résultats générés sont intégrés au projet et ont été vérifiés et adaptés à son code et à ses besoins.

## Sécurité

### En-têtes HTTP

L'API envoie une CSP restrictive sur ses réponses (`default-src 'none'`,
`frame-ancestors 'none'`, etc.). Swagger a une CSP distincte qui autorise ses
ressources locales et ses styles/scripts inline nécessaires, tout en interdisant
l'intégration dans une frame. Toutes les réponses incluent aussi
`X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin` et une
`Permissions-Policy` qui désactive caméra, géolocalisation et microphone.

Pour vérifier les en-têtes HTTP sur l'API et sur Swagger depuis PowerShell :

```powershell
curl.exe -I http://localhost:8000/openapi.json
curl.exe -I http://localhost:8000/docs/
```

La première commande montre la CSP API et la seconde la CSP de Swagger. Les deux
doivent également afficher `X-Content-Type-Options`, `Referrer-Policy` et
`Permissions-Policy`.

### Flux et frontières de confiance

```text
 FRONTIÈRE 1 — clients non fiables
 [Navigateur / application cliente]
        | HTTPS en production ; requêtes HTTP locales en développement
        | JSON, paramètres d'URL et cookie de session HttpOnly
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
L'API vérifie le cookie de session et certaines routes contrôlent aussi le rôle.
Les bases de données sont des services distincts qui doivent rester accessibles
uniquement depuis les composants autorisés. En production, le trafic public doit
passer par HTTPS.

### Surfaces d'entrée

| Surface | Présence dans le projet |
| --- | --- |
| Formulaires | Aucun formulaire ou frontend n'est fourni. Les données de formulaire éventuelles arrivent à l'API sous forme de JSON. |
| URL | Routes et paramètres de chemin, par exemple `/produits/:id` et `/comments/:productId`. |
| Cookies | Cookie `session` HttpOnly, SameSite=Lax, limité à 7 jours et Secure en production ; révoqué côté serveur à la déconnexion. Un cookie CSRF distinct est SameSite=Lax et vérifié avec l'en-tête `X-CSRF-Token`. |
| Fichiers | Images produit reçues en multipart, vérifiées et enregistrées dans `UPLOAD_DIR`, hors du dossier public ; téléchargées en pièce jointe. Le serveur lit aussi `docs/openapi.yaml` au démarrage. |
| API | Corps JSON des requêtes d’inscription, connexion, profil, produits, panier et commentaires ; le cookie de session authentifie les routes protégées. `/docs` expose Swagger. |
| Dépendances | Paquets npm déclarés dans `package.json` et verrouillés dans `package-lock.json`, installés avec `npm ci` et chargés par le serveur. |

### Protection CSRF

Avant toute requête qui modifie des données (`POST`, `PATCH`, `PUT` ou `DELETE`),
le client appelle `GET /auth/csrf` et conserve le cookie `csrfToken` ainsi que le
jeton JSON reçu. Il renvoie le même jeton dans l'en-tête `X-CSRF-Token`. Le serveur
compare le cookie et l'en-tête, vérifie la signature HMAC du jeton et rejette
aussi un `Origin`/`Referer` différent de l'origine attendue. Cette protection
couvre aussi l'inscription, la connexion et la déconnexion. Le cookie de session
reste HttpOnly ; le jeton CSRF n'est pas un secret d'authentification.

Exemple de preuve : `csrf-protection.test.js` envoie `POST /auth/register` sans
jeton et vérifie la réponse `403 { "erreur": "Jeton CSRF manquant ou invalide." }`
ainsi que l'absence de tout appel à la base. Il vérifie aussi qu'un jeton correct
ne suffit pas si l'Origin est étranger.

Les méthodes `GET`, `HEAD` et `OPTIONS` sont ignorées par le contrôle CSRF et ne
doivent pas modifier les données. En particulier, `GET /panier` ne crée plus de
commande : il renvoie `panier: null` si aucun panier n'existe. Une action qui
modifie par GET pourrait être déclenchée automatiquement par une image, un lien
ou une navigation cross-site, sans jeton CSRF. Derrière un proxy HTTPS, configurez
`APP_ORIGIN` avec l'origine publique, par exemple `https://api.example.test`.

### Rôles et autorisation

L'API distingue exactement deux rôles : `user` et `admin`. Une inscription crée
toujours un compte `user` ; le rôle envoyé éventuellement par le client est
ignoré et ne peut pas attribuer les droits admin. Pour initialiser un administrateur,
créez d'abord son compte normalement puis, avec un accès autorisé à PostgreSQL,
attribuez le rôle une seule fois :

```sql
UPDATE "User" SET "role" = 'admin' WHERE "email" = 'admin@example.test';
```

Les routes d'administration sont dans `src/routes/users.routes.js`, sous un
routeur qui applique `authMiddleware` puis `roleMiddleware('admin')` avant chaque
route. `src/midleware/auth.js` relit aussi le rôle actuel en base à chaque requête
protégée ; un rôle ancien ou falsifié dans le JWT ne donne donc pas accès. Un
utilisateur connecté qui appelle `GET /users/admin/utilisateurs` reçoit `403
Access denied` ; sans session, il reçoit `401`. Le test
`auth-session.test.js` vérifie ces refus et le contrôle avec le rôle courant.
Ce dépôt ne contient pas d'interface web : l'autorisation est appliquée aux
routes API côté serveur, pas seulement à un élément d'interface masqué.

La migration `20261123220000_two_user_roles` convertit les anciens rôles
`client` et `vendeur` en `user`, conserve `admin` et interdit les autres valeurs.
Appliquez-la avec `npx prisma migrate deploy`.

### Propriétaire des ressources et mass assignment

Le profil est toujours lu ou modifié avec l'identifiant authentifié du cookie ;
`userId` et `id` dans le corps ne déterminent jamais le compte ciblé. La mise à
jour du profil n'accepte que `name`, `email` et `password` et rejette les autres
champs. La création de produits, les lignes de panier et les commentaires
construisent également leurs données côté serveur à partir d'une liste de champs
autorisés ; l'identifiant propriétaire, le prix d'une ligne de panier et l'auteur
d'un commentaire ne viennent pas du client.

Pour les lignes de panier, `src/controllers/panier.controller.js` recherche
l'article avec son identifiant **et** la relation de commande liée à
`req.user.id`, avec le statut `pending`. Un autre compte qui remplace l'identifiant
dans l'URL reçoit `404 Ligne de panier introuvable` (sans
révéler si l'identifiant existe) ; aucune mise à jour ni suppression n'est faite.
Si le filtre `order.userId` était retiré, le `findFirst` pourrait retrouver la
ligne de l'autre compte et les écritures suivantes pourraient la modifier ou la
supprimer. `idor-authorization.test.js` teste ce cas avec deux identifiants de
compte, l'accès du propriétaire et le rejet des champs `id`, `userId`, `role` et
`banned` lors de la mise à jour du profil.

### Menaces principales

| Priorité | Menace | Première mesure de parade |
| --- | --- | --- |
| Haute | **Falsification de jetons si `JWT_SECRET` est absent** : le code utilise alors la valeur connue `dev-secret`, ce qui peut permettre de fabriquer des jetons acceptés par l'API. | Refuser de démarrer en production si le secret manque ; fournir un secret aléatoire robuste via le gestionnaire de secrets et le renouveler en cas d'exposition. |
| Haute | **Divulgation de données personnelles** : les réponses publiques du catalogue et du détail produit incluent l'adresse e-mail du vendeur. | Ne renvoyer que les champs du vendeur destinés à être publics, par exemple son identifiant et son nom. |
| Moyenne | **Essais automatisés et abus des comptes** : des requêtes répétées peuvent viser les mots de passe ou créer des comptes en masse. | La connexion limite les tentatives par adresse IP et par e-mail ; surveiller les échecs et ajouter une protection d'inscription adaptée au déploiement. |
| Moyenne | **Abus ou obsolescence des autorisations** : les rôles sont contrôlés par les routes et le rôle actuel est relu en base à chaque requête protégée. | Garder les nouvelles routes privées derrière authentification et autorisation explicites ; promouvoir les comptes admin par une opération DB autorisée. |
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

Les tests HTTP de régression envoient également des charges d'attaque à l'API :
`sql-injection-http.test.js` vérifie que l'e-mail SQL est traité comme une valeur
littérale, que la réponse est 404 et qu'aucun jeton n'est créé ;
`xss-output.test.js` vérifie que `<` et `>` sortent sous forme `\u003c` et
`\u003e` dans le JSON brut, tout en retrouvant le texte original après parsing ;
`product-image-upload.test.js` vérifie que les fichiers PHP, SVG et un script
renommé en JPG reçoivent une réponse 400 et ne sont ni enregistrés ni utilisés
pour créer un produit. Lancez `npm test` pour exécuter ces vérifications.

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

### Authentification et stockage des mots de passe

L'inscription et les changements de mot de passe stockent un hash bcrypt
(`bcryptjs`, coût 10) avec un sel aléatoire intégré au hash, jamais le mot de
passe lui-même. La connexion vérifie le mot de passe avec `bcrypt.compare`.
L'inscription et la connexion mettent le jeton de session dans le cookie `session`
et ne le renvoient pas dans le JSON. `POST /auth/disconnect` révoque le jeton
côté serveur jusqu'à son expiration, puis efface le cookie. Appliquez la migration
avec `npx prisma migrate deploy` avant de redémarrer l'API. Les sessions expirées
sont nettoyées à la prochaine déconnexion. Le test `auth-session.test.js` vérifie
le hash stocké, les attributs du cookie, le renouvellement de session et sa
révocation au logout. Les erreurs internes de l'inscription et de la connexion
sont journalisées côté serveur et renvoient au client un message générique avec
un identifiant de référence, sans détails de base de données.

Le cookie est `HttpOnly` pour empêcher sa lecture par JavaScript, `SameSite=Lax`
pour limiter les envois cross-site et expire après 7 jours, comme le jeton.
En production, `Secure` est activé automatiquement avec `NODE_ENV=production`.
En développement HTTP local, il reste désactivé pour que le navigateur accepte
le cookie ; `COOKIE_SECURE=true` permet aussi de vérifier/forcer l'attribut dans
un environnement HTTPS. Les requêtes du navigateur vers les routes protégées
doivent envoyer les cookies (`credentials: 'include'` si le frontend est sur une
autre origine, avec une configuration CORS adaptée) et ajouter
`X-CSRF-Token` aux actions qui modifient.
Pour inspecter le cookie dans les outils du navigateur : **Application/Storage →
Cookies → session** ; les colonnes `HttpOnly`, `Secure`, `SameSite`, `Path` et
`Expires/Max-Age` montrent ses protections et sa durée de vie.

La connexion répond toujours `401` avec `Identifiants invalides.` que l'adresse
e-mail soit inconnue ou que le mot de passe soit incorrect. Un hash factice est
vérifié avec bcrypt quand le compte n'existe pas, afin d'éviter une différence
évidente de temps de réponse.

Dans les deux cas, le client reçoit exactement :

```json
{ "erreur": "Identifiants invalides." }
```

Les connexions sont limitées à 5 tentatives par adresse IP et à 5 par e-mail sur
une fenêtre de 15 minutes. Une limite atteinte renvoie `429` et
`Trop de tentatives. Réessayez plus tard.`. Le stockage du limiteur est en mémoire
du processus : pour plusieurs instances ou un déploiement distribué, il faut
configurer un store partagé. L'inscription et le changement de mot de passe
exigent au moins 12 caractères, sans règles de composition ; bcrypt étant limité
à 72 octets, les mots de passe plus longs sont refusés.
Les tests `sql-injection-http.test.js` et `auth-rate-limit.test.js` démontrent
respectivement la réponse identique et les limites par compte et par IP.

### Authentification à deux facteurs (TOTP)

Configurez une clé dédiée de 32 octets avant d'activer le MFA. Pour en générer
une localement :

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Après connexion, `POST /auth/totp/setup` renvoie un QR code à scanner avec une
application TOTP, ainsi qu'une clé de configuration manuelle. L'activation se
fait via `POST /auth/totp/enable` en fournissant un premier code valide. La
connexion demande ensuite `totpCode`; une fenêtre d'horloge de ±30 secondes est
acceptée. Dix codes de secours sont affichés une seule fois. Ils sont stockés
hachés avec bcrypt et chacun ne fonctionne qu'une fois.

Le secret TOTP est chiffré avec AES-256-GCM avant d'être stocké dans la colonne
`User.totpSecret`; la clé `TOTP_ENCRYPTION_KEY` reste uniquement dans la
configuration du serveur. Gardez-en une sauvegarde sûre : perdre cette clé rend
les secrets TOTP stockés indéchiffrables. Si l'utilisateur perd son téléphone,
il peut se connecter avec un code de secours, puis désactiver le MFA avec son
mot de passe dans les dix minutes qui suivent cette connexion. Il peut alors
enrôler un nouvel appareil. En dehors de ce délai, un code TOTP ou de secours
inutilisé est aussi nécessaire avec le mot de passe. Les migrations Prisma créent
également la table `TotpBackupCode`, qui ne contient que les hashes des codes de
secours.
