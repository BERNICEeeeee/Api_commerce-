require('dotenv').config();
const app = require('./app');
const { port, nodeEnv, debugEnabled } = require('./config/env');

const server = app.listen(port, () => {
  console.log(
    `E-Commerce API on http://localhost:${port} (env=${nodeEnv}, debug=${debugEnabled})`
  );
});

server.on('error', (err) => {
  console.error('[SERVER_ERROR] Impossible de démarrer le serveur:', err.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED_REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT_EXCEPTION]', err);
  process.exit(1);
});