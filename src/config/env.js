const nodeEnv = (process.env.NODE_ENV || 'production').toLowerCase();
const isDevelopment = nodeEnv === 'development';
const isProduction = nodeEnv === 'production';

// Jamais de mode debug en production (et uniquement actif si explicitement demandé hors prod)
const debugEnabled = !isProduction && process.env.DEBUG === 'true';

module.exports = {
  nodeEnv,
  isDevelopment,
  isProduction,
  debugEnabled,
  port: Number(process.env.PORT || 8000),
};