import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import env from './env.js';
import { pool } from './db.js';

const MySQLStore = MySQLStoreFactory(session);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const store = new MySQLStore(
  {
    createDatabaseTable: false,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: ONE_DAY_MS,
    charset: 'utf8mb4_bin',
    schema: {
      tableName: 'sessions',
      columnNames: {
        session_id: 'session_id',
        expires: 'expires',
        data: 'data',
      },
    },
  },
  pool
);

export const SESSION_COOKIE_NAME = 'mcgill.sid';

export function sessionMiddleware() {
  return session({
    name: SESSION_COOKIE_NAME,
    secret: env.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.nodeEnv === 'production',
      maxAge: ONE_DAY_MS,
    },
  });
}

export function closeSessionStore() {
  return store.close();
}
