import 'dotenv/config';

// Stops the app right away if something important is missing from .env
function mustSet(key) {
  const val = process.env[key];
  if (val === undefined || val === '') {
    throw new Error(`You need to set ${key} in your .env file`);
  }
  return val;
}

function corsOrigin() {
  const raw = process.env.FRONTEND_ORIGIN;
  if (raw == null || String(raw).trim() === '') {
    return true;
  }
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 1) {
    return parts[0];
  }
  return parts;
}

export default {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: mustSet('SESSION_SECRET'),
  corsOrigin: corsOrigin(),
  db: {
    host: mustSet('DB_HOST'),
    user: mustSet('DB_USER'),
    password: mustSet('DB_PASS'),
    database: mustSet('DB_NAME'),
    port: parseInt(process.env.DB_PORT || '3306', 10),
  },
};
