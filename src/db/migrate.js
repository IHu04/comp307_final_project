import { readFile, readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { pool } from '../config/db.js';

// resolve the migrations folder relative to this file
const here = path.dirname(fileURLToPath(import.meta.url));
const folder = path.join(here, 'migrations');

// strips sql line comments and splits the file into individual statements
function sqlStatements(fileContents) {
  const withoutLineComments = fileContents.replace(/^\s*--.*$/gm, '');
  return withoutLineComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// creates the tracking table if it does not exist yet
async function setupTrackingTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// returns a set of migration filenames that have already been applied
async function alreadyRan() {
  const [rows] = await pool.query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  const names = new Set();
  for (const row of rows) {
    names.add(row.filename);
  }
  return names;
}

// apply pending .sql files in order, leaves the pool open, returns how many files ran
export async function runMigration() {
  await setupTrackingTable();
  const done = await alreadyRan();

  // read and sort all sql files so they run in filename order
  const files = (await readdir(folder))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const name of files) {
    if (done.has(name)) {
      continue;
    }
    const fileText = await readFile(path.join(folder, name), 'utf8');
    const statements = sqlStatements(fileText);

    // run each file in a transaction so a failure rolls back the whole file
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const stmt of statements) {
        await connection.query(stmt);
      }
      await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [name]);
      await connection.commit();
      console.log('Ran migration: ' + name);
      ran += 1;
    } catch (e) {
      await connection.rollback();
      console.error('Migration failed: ' + name, e);
      throw e;
    } finally {
      connection.release();
    }
  }

  if (ran === 0) {
    console.log('Nothing new to migrate.');
  }

  return ran;
}

// only runs when this file is invoked directly, not when imported
const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  runMigration()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      pool.end().finally(() => process.exit(1));
    });
}
