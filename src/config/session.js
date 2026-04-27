import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import env from './env.js';
import { pool } from './db.js';

// wires the mysql session store to the express-session library
const MySQLStore = MySQLStoreFactory(session);

// one day in milliseconds used for both session expiry and cookie lifetime
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// connects the session store to the existing db pool and points it at the sessions table
const store = new MySQLStore(
  {
    createDatabaseTable: false,
    clearExpired: true,
    // checks for and removes expired sessions every 15 minutes
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

// cookie name sent to the browser
export const SESSION_COOKIE_NAME = 'mcgill.sid';

// builds express session middleware using mysql stored sessions
export function sessionMiddleware() {
  return session({
    name: SESSION_COOKIE_NAME,
    secret: env.sessionSecret,
    store,
    // avoids unnecessary db writes when nothing changed
    resave: false,
    // does not create a session until the user actually logs in
    saveUninitialized: false,
    // resets the cookie expiry on every request so active users stay logged in
    rolling: true,
    cookie: {
      // prevents javascript on the page from reading the cookie
      httpOnly: true,
      sameSite: 'lax',
      // only sends over https in production
      secure: env.nodeEnv === 'production',
      maxAge: ONE_DAY_MS,
    },
  });
}

// closes the mysql session store on shutdown
export function closeSessionStore() {
  return store.close();
}
