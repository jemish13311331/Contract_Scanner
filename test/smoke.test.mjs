// Smoke tests for the critical paths: analyze + payment (and the auth guard that
// protects them). These boot the REAL server as a subprocess and drive it over
// HTTP, so they exercise the whole middleware stack (helmet, rate limiting,
// auth, multer, validation) — not mocked internals.
//
// They need a Postgres to talk to (DATABASE_URL). In CI a postgres service
// provides one; locally, if none is reachable, the suite skips itself with a
// warning instead of failing. No OpenAI or Stripe keys are required: the analyze
// test hits input validation before any model call, and the payment test uses the
// keyless "mock" checkout path, which still fulfills a purchase in the database.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT || 4199);
const BASE = `http://localhost:${PORT}`;
const CONN =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/contract_scanner_test';

const TEST_EMAIL = 'smoke-test@example.com';
const TEST_PASSWORD = 'smoke-test-password-123';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (c) => c.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@');

// Is a database reachable? Decides whether we run or skip.
async function dbReachable() {
  const client = new pg.Client({ connectionString: CONN, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
}

const DB_UP = await dbReachable();
if (!DB_UP) {
  console.warn(`\n[smoke] No database reachable at ${redact(CONN)} — skipping smoke tests.\n`);
}

async function waitForHealth(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(300);
  }
  throw new Error('server did not become healthy within timeout');
}

describe('smoke: analyze + payment paths', { skip: DB_UP ? false : 'no database reachable' }, () => {
  let child;
  let db;
  let token;

  before(async () => {
    db = new pg.Client({ connectionString: CONN });
    await db.connect();

    // Fresh schema, then seed one verified user we can log in as.
    await db.query(readFileSync(join(ROOT, 'db', 'schema.sql'), 'utf8'));
    await db.query('DELETE FROM users WHERE email = $1', [TEST_EMAIL]);
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4); // low cost: speed over strength in tests
    await db.query(
      `INSERT INTO users (first_name, email, password_hash, email_verified, credits_remaining, free_trials_used)
       VALUES ('Smoke', $1, $2, true, 0, 0)`,
      [TEST_EMAIL, passwordHash]
    );

    // Boot the real server. Keys are forced so external integrations stay off:
    // dummy OpenAI (analyze stops at validation), no Stripe (mock checkout path).
    child = spawn('node', ['server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'test',
        DATABASE_URL: CONN,
        JWT_SECRET: 'test-secret-not-for-production',
        OPENAI_API_KEY: 'test-dummy-key',
        STRIPE_SECRET_KEY: '',
        STRIPE_PUBLISHABLE_KEY: '',
        STRIPE_WEBHOOK_SECRET: '',
        RESEND_API_KEY: '',
        SENTRY_DSN: '',
        FORCE_HTTPS: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serverLog = '';
    child.stdout.on('data', (d) => { serverLog += d; });
    child.stderr.on('data', (d) => { serverLog += d; });
    try {
      await waitForHealth();
    } catch (err) {
      throw new Error(`${err.message}\n--- server output ---\n${serverLog}`);
    }

    // Log in to get a bearer token for the authenticated payment tests.
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    assert.equal(res.status, 200, 'login should succeed for the seeded user');
    ({ token } = await res.json());
    assert.ok(token, 'login should return a token');
  });

  after(async () => {
    if (child && !child.killed) child.kill('SIGKILL');
    if (db) {
      try { await db.query('DELETE FROM users WHERE email = $1', [TEST_EMAIL]); } catch { /* ignore */ }
      await db.end();
    }
  });

  test('health endpoint is up', async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.db, true, 'health should report the database as reachable');
  });

  test('analyze rejects a request with no contract input (400)', async () => {
    // Reaches the analyze route through auth + rate limiter + multer, then fails
    // input validation — never calling the model.
    const res = await fetch(`${BASE}/api/analyze`, { method: 'POST' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error, 'should return a generic error message');
  });

  test('records list requires authentication (401)', async () => {
    const res = await fetch(`${BASE}/api/records`);
    assert.equal(res.status, 401);
  });

  test('checkout rejects an unknown plan (400)', async () => {
    const res = await fetch(`${BASE}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan: 'does-not-exist' }),
    });
    assert.equal(res.status, 400);
  });

  test('checkout fulfills a plan and grants entitlement (payment path)', async () => {
    const res = await fetch(`${BASE}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ plan: 'starter' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.mock, true, 'keyless checkout should use the mock fulfillment path');
    assert.equal(body.fulfilled, true, 'the purchase should be fulfilled');
    assert.ok(
      body.user.creditsRemaining >= 5,
      `starter plan should grant 5 credits (got ${body.user.creditsRemaining})`
    );

    // Confirm it actually persisted: a succeeded payment row exists for the user.
    const { rows } = await db.query(
      `SELECT status FROM payments p JOIN users u ON u.id = p.user_id
        WHERE u.email = $1 AND p.category = 'starter'`,
      [TEST_EMAIL]
    );
    assert.ok(rows.length >= 1, 'a payment row should be recorded');
    assert.equal(rows[0].status, 'succeeded');
  });
});
