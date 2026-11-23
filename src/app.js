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

const app = express();

const API_CONTENT_SECURITY_POLICY = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
const DOCS_CONTENT_SECURITY_POLICY = "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'";

app.use((req, res, next) => {
  const isSwaggerPage = req.path === '/docs' || req.path.startsWith('/docs/');
  res.setHeader(
    'Content-Security-Policy',
    isSwaggerPage ? DOCS_CONTENT_SECURITY_POLICY : API_CONTENT_SECURITY_POLICY
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.use(express.json());

const openapi = YAML.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8'));

app.get('/', (req, res) => res.redirect('/docs'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.get('/openapi.json', (req, res) => res.json(openapi));

app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/produits', produitsRoutes);
app.use('/panier', panierRoutes);
app.use('/comments', commentsRoutes);

module.exports = app;