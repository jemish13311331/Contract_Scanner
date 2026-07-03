import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// DATABASE_URL drives the connection; falls back to local defaults (PG* env vars).
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

export const query = (text, params) => pool.query(text, params);

// Run a function inside a transaction; auto COMMIT/ROLLBACK.
export const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const dbHealthy = async () => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};
