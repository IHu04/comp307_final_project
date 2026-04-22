import mysql from 'mysql2/promise';
import env from './env.js';

// one shared pool is cheaper than a new connection per request
export const pool = mysql.createPool({
  host: env.db.host,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  port: env.db.port,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
});

export async function connectDB() {
  try {
    await pool.query('SELECT 1');
    console.log('Connected to MySQL');
  } catch (e) {
    console.error('Could not connect to MySQL:', e.message);
    process.exit(1);
  }
}

export async function disconnectDB() {
  await pool.end();
}
