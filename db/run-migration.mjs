// Tiny migration runner: node db/run-migration.mjs <path-to.sql>
import { readFileSync } from 'fs';
import { pool } from './index.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node db/run-migration.mjs <path-to.sql>');
  process.exit(1);
}

const sql = readFileSync(file, 'utf8');
try {
  await pool.query(sql);
  console.log(`Applied: ${file}`);
} catch (err) {
  console.error(`Migration failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
