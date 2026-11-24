require('dotenv').config();

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const fs = require('node:fs');
const path = require('node:path');

const authRoutes = require('./routes/auth.routes.js');
const usersRoutes = require('./routes/users.routes.js');
const produitsRoutes = require('./routes/produits.routes.js');
const panierRoutes = require('./routes/panier.routes.js');
const commentsRoutes = require('./routes/comments.routes.js');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler.js');
const { csrfProtection } = require('./middleware/csrf.js');

const app = express();
app.set('json escape', true);

const API_CONTENT_SECURITY_POLICY =
  "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
const DOCS_CONTENT_SECURITY_POLICY =
  "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'";

app.use((req, res, next) => {
  const isSwaggerPage = req.path === '/docs' || req.path.startsWith('/docs/');
  res.setHeader(
    'Content-Security-Policy',
    isSwaggerPage ? DOCS_CONTENT_SECURITY_POLICY : API_CONTENT_SECURITY_POLICY
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  next();
});

app.use(csrfProtection);
app.use(express.json());

const openapi = YAML.parse(
  fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8')
);

const swaggerRequestInterceptor = async (request) => {
  request.credentials = 'include';

  const method = (request.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return request;

  const manualMode = new URLSearchParams(window.location.search).get('csrf') === 'manual';
  if (manualMode) {
    request.headers = request.headers || {};
    delete request.headers['X-CSRF-Token'];
    delete request.headers['x-csrf-token'];
    return request;
  }

  const csrfResponse = await fetch(`${window.location.origin}/auth/csrf`, {
    credentials: 'include',
    cache: 'no-store'
  });
  if (!csrfResponse.ok) {
    throw new Error(`Impossible d'obtenir le jeton CSRF : HTTP ${csrfResponse.status}`);
  }

  const { csrfToken } = await csrfResponse.json();
  if (!csrfToken) {
    throw new Error('La réponse CSRF ne contient pas de jeton.');
  }

  request.headers = request.headers || {};
  request.headers['X-CSRF-Token'] = csrfToken;
  return request;
};

app.get('/', (req, res) => res.redirect('/docs'));
app.get('/docs/csrf-test', (_req, res) => res.redirect('/docs/?csrf=manual'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, {
  swaggerOptions: {
    requestInterceptor: swaggerRequestInterceptor
  }
}));
app.get('/openapi.json', (req, res) => res.json(openapi));

app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/produits', produitsRoutes);
app.use('/panier', panierRoutes);
app.use('/comments', commentsRoutes);

// 404 puis gestionnaire d'erreurs centralisé (toujours en dernier)
app.get('/privacy', (_req, res) => {
  res.type('html').send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8" />
      <title>Politique de confidentialité</title>
    </head>
    <body>
      <h1>Politique de confidentialité</h1>
      <h2>1. Finalités</h2>
      <p>Gestion des comptes clients, authentification, sécurité (2FA) et traitement des commandes e-commerce.</p>
      <h2>2. Base légale</h2>
      <p>Exécution du contrat de vente, respect d'obligations légales et intérêt légitime de sécurité.</p>
      <h2>3. Durées de conservation</h2>
      <p>Données de compte conservées pendant la durée d'activité puis archivées selon les obligations légales ; logs techniques limités dans le temps.</p>
      <h2>4. Vos droits</h2>
      <p>Droit d'accès, de rectification, d'effacement, d'opposition, de limitation et de portabilité de vos données.</p>
      <h2>5. Contact</h2>
      <p>Contact confidentialité : privacy@exemple-ecommerce.local</p>
    </body>
    </html>
  `);
});
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;