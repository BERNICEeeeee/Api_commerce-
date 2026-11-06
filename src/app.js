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