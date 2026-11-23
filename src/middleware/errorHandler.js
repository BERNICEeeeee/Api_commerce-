const crypto = require('node:crypto');
const { debugEnabled } = require('../config/env');

function resolveErrorDetails(err) {
  // Corps JSON invalide envoyé par Express (body-parser / express.json)
  if (err.type === 'entity.parse.failed') {
    return {
      status: 400,
      clientMessage: 'Le corps de la requête JSON est invalide.',
    };
  }

  // Validation Zod (si tu utilises Zod dans tes routes)
  if (err.name === 'ZodError') {
    return {
      status: 400,
      clientMessage: 'Les données envoyées sont invalides.',
    };
  }

  // Erreurs Prisma connues (on ne renvoie jamais le détail SQL/table au client)
  if (err.code === 'P2002') {
    return {
      status: 409,
      clientMessage: 'Cette ressource existe déjà.',
    };
  }

  if (err.code === 'P2025') {
    return {
      status: 404,
      clientMessage: 'Ressource introuvable.',
    };
  }

  // Erreur HTTP explicite avec message sûr
  const status = Number(err.status || err.statusCode || 500);
  if (status >= 400 && status < 500 && err.expose) {
    return {
      status,
      clientMessage: err.message,
    };
  }

  // Par défaut : message générique neutre
  return {
    status: status >= 400 ? status : 500,
    clientMessage: 'Une erreur inattendue est survenue. Veuillez réessayer plus tard.',
  };
}

function notFoundHandler(req, res, next) {
  const err = new Error('Route introuvable.');
  err.status = 404;
  err.expose = true;
  next(err);
}

function errorHandler(err, req, res, _next) {
  const referenceId = crypto.randomUUID();
  const { status, clientMessage } = resolveErrorDetails(err);

  // Détail complet enregistré uniquement côté serveur (journaux)
  console.error(`[ERROR] [${referenceId}] ${req.method} ${req.originalUrl} -> ${status}`, {
    name: err.name,
    code: err.code,
    message: err.message,
    stack: err.stack,
  });

  // Réponse neutre côté utilisateur
  const responseBody = {
    error: clientMessage,
    referenceId,
  };

  // Uniquement si le mode debug est autorisé (hors production)
  if (debugEnabled) {
    responseBody.debug = {
      name: err.name,
      code: err.code,
      message: err.message,
      stack: err.stack,
    };
  }

  res.status(status).json(responseBody);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};