import express from 'express';
import dotenv from 'dotenv';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';
import mammoth from 'mammoth';
// NOTE: pdfjs-dist and tesseract.js are intentionally NOT imported at the top.
// pdfjs references DOMMatrix at module-eval time, which crashes on import in
// serverless runtimes; both are heavy. They're lazy-loaded inside the extraction
// helpers below so importing this app never crashes and cold starts stay light
// for non-upload requests (auth, billing, etc.).
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { Resend } from 'resend';
import { OAuth2Client } from 'google-auth-library';
import { query, withTransaction, dbHealthy } from './db/index.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Error monitoring (Sentry). No-op unless SENTRY_DSN is set, so local/dev runs
// and CI are unaffected. Initialized before routes so it can capture anything.
const SENTRY_DSN = process.env.SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
  });
}
// Report an error to Sentry when configured; safe to call unconditionally.
const captureError = (err) => {
  if (SENTRY_DSN) Sentry.captureException(err);
};

// Trust the reverse proxy (Render/Nginx/etc.) so req.ip reflects the real client
// rather than the proxy — required for accurate per-IP rate limiting. Configurable
// via TRUST_PROXY (number of hops); defaults to 0 for direct local runs.
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));

// Force HTTPS in production behind a TLS-terminating proxy. Opt-in via
// FORCE_HTTPS=true so local plain-HTTP runs are unaffected. Relies on
// `trust proxy` above so req.secure reflects the proxy's X-Forwarded-Proto.
if (process.env.FORCE_HTTPS === 'true') {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();
    return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  });
}

// Security headers (Helmet). The CSP is tailored to what the app actually loads:
//  - Stripe.js (script) + its Elements iframes (frame) + api.stripe.com (connect)
//  - Google Fonts stylesheet (style) + font files (font)
//  - inline styles: the UI relies on styled <style> blocks and style= attributes,
//    so style-src needs 'unsafe-inline' (low risk; script-src stays locked down).
// HSTS is production-only so local plain-HTTP runs aren't pinned to https.
// In dev the SPA is served by Vite (:5173), not Express, so this CSP governs the
// app only in production where Express serves the built dist/ — Vite HMR is unaffected.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://js.stripe.com', 'https://accounts.google.com/gsi/client'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com/gsi/style'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://api.stripe.com', 'https://accounts.google.com/gsi/'],
        frameSrc: ['https://js.stripe.com', 'https://hooks.stripe.com', 'https://accounts.google.com/gsi/'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        // Only auto-upgrade http→https subresources in production.
        upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
      },
    },
    // Send HSTS only in production (behind TLS). 180 days, includeSubDomains, preload.
    hsts: IS_PRODUCTION ? { maxAge: 15552000, includeSubDomains: true, preload: true } : false,
    // Stripe Elements iframes break under COEP; leave it off.
    crossOriginEmbedderPolicy: false,
  })
);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
// JWT signing secret. In production a weak or missing secret means anyone can
// forge auth tokens, so we fail fast on boot rather than silently falling back to
// the well-known dev value. Outside production the dev default keeps local runs
// frictionless.
const DEV_JWT_SECRET = 'dev-insecure-secret-change-me';
if (IS_PRODUCTION && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_JWT_SECRET)) {
  console.error('FATAL: JWT_SECRET must be set to a strong, unique value in production (it is missing or still the dev default).');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;

// ---- Tunable config (env-overridable; sensible defaults for local dev) ------
// Parse an integer env var, falling back to a default when it's unset/invalid.
const envInt = (name, fallback) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) ? n : fallback;
};
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const BCRYPT_ROUNDS = envInt('BCRYPT_ROUNDS', 12);          // password hashing cost
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d'; // session token lifetime
const FREE_TRIAL_LIMIT = envInt('FREE_TRIAL_LIMIT', 1);     // anonymous free analyses
const MAX_UPLOAD_BYTES = envInt('MAX_UPLOAD_MB', 15) * 1024 * 1024;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

// Stripe — optional. When unset, checkout falls back to a local mock grant.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

// Email (Resend) — optional. When unset, we log the link to the console so the
// verification flow is testable in development without sending real mail.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Contract Scanner <onboarding@resend.dev>';
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// Google sign-in — optional. When GOOGLE_CLIENT_ID is unset the button is hidden
// (the /api/auth/config endpoint returns null) and the endpoint returns 503.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const VERIFY_TOKEN_TTL_MIN = envInt('VERIFY_TOKEN_TTL_MIN', 30);
const RESET_TOKEN_TTL_MIN = envInt('RESET_TOKEN_TTL_MIN', 30);

// Server-side plan catalog (source of truth for what a purchase grants).
const PLAN_CATALOG = {
  starter: { category: 'starter', credits: 5, amountCents: 999 },
  pro: { category: 'pro', credits: 50, amountCents: 4999 },
  unlimited: { category: 'unlimited', unlimitedDays: 30, amountCents: 9999 },
};

let worker = null;
let workerPromise = null;
let workerReady = false;

const ensureWorker = async () => {
  if (!workerReady) {
    if (!workerPromise) {
      const { createWorker } = await import('tesseract.js'); // lazy: heavy OCR engine
      workerPromise = createWorker({ logger: () => {} });
    }
    worker = await workerPromise;
    if (typeof worker.load === 'function') {
      await worker.load();
    }
    if (typeof worker.loadLanguage === 'function') {
      await worker.loadLanguage('eng');
    }
    if (typeof worker.initialize === 'function') {
      await worker.initialize('eng');
    }
    workerReady = true;
  }
};

app.use(express.json());

// ============================================================================
//  Rate limiting
// ============================================================================
// Standard `RateLimit-*` headers (IETF draft-7) let clients back off gracefully;
// the legacy `X-RateLimit-*` headers are disabled to avoid duplication.
const limiterDefaults = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
};

// Collapse an IPv6 address to its /64 prefix so a client can't sidestep the limit
// by rotating through the trailing bits it fully controls. IPv4 passes through.
const normalizeIp = (ip = '') =>
  ip.includes(':') ? ip.split(':').slice(0, 4).join(':') + '::/64' : ip;

// Prefer the authenticated user id as the key so a signed-in user isn't throttled
// by others behind the same NAT/proxy IP; fall back to the (IPv6-safe) client IP.
const keyByUserOrIp = (req) =>
  req.user ? `u:${req.user.id}` : normalizeIp(req.ip);

const rateLimited = (res, message) =>
  res.status(429).json({ error: message, retryable: true });

// Broad safety net across the whole API — catches runaway clients / scrapers.
const apiLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * MINUTE_MS,
  limit: envInt('API_RATE_LIMIT', 300),
  handler: (_req, res) => rateLimited(res, 'Too many requests. Please slow down and try again shortly.'),
});

// Tight limit on credential endpoints to blunt brute-force / credential-stuffing.
// `skipSuccessfulRequests` means only failed attempts count toward the cap.
const authLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 15 * MINUTE_MS,
  limit: envInt('AUTH_RATE_LIMIT', 10),
  skipSuccessfulRequests: true,
  handler: (_req, res) => rateLimited(res, 'Too many attempts. Please wait a few minutes before trying again.'),
});

// The analysis route is the expensive one (OCR + OpenAI), so it gets its own,
// stricter budget keyed per user when signed in.
const analyzeLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: HOUR_MS,
  limit: envInt('ANALYZE_RATE_LIMIT', 30),
  keyGenerator: keyByUserOrIp,
  // We normalize IPv6 ourselves in keyByUserOrIp, so silence the built-in IP check.
  validate: { ip: false },
  handler: (_req, res) => rateLimited(res, 'You’re analyzing very quickly. Please wait a bit before submitting another contract.'),
});

// Broad safety net across the whole API.
app.use('/api', apiLimiter);

// ============================================================================
//  Auth & entitlement helpers
// ============================================================================
const signToken = (user) => jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

// Public-safe view of a user row (never leak password_hash).
const publicUser = (u) => ({
  id: u.id,
  firstName: u.first_name,
  lastName: u.last_name,
  email: u.email,
  phoneNumber: u.phone_number,
  subscriptionType: u.subscription_type,
  creditsRemaining: u.credits_remaining,
  freeTrialsUsed: u.free_trials_used,
  unlimitedUntil: u.unlimited_until,
  emailVerified: u.email_verified,
  createdAt: u.created_at,
});

// Log the real error server-side (with a context label for tracing) and return a
// generic message to the client — internal/DB details must never reach the browser.
const serverError = (res, context, caught, { status = 500, message = 'Something went wrong. Please try again.' } = {}) => {
  console.error(`${context}:`, caught instanceof Error ? caught.message : caught);
  // Only 5xx (unexpected server faults) are worth alerting on — 4xx are client input.
  if (status >= 500) captureError(caught);
  return res.status(status).json({ error: message });
};

// ============================================================================
//  Email + verification-token helpers
// ============================================================================
// Send an email via Resend. Without an API key, log a dev-friendly version so
// the flow works end-to-end locally without sending anything.
const sendEmail = async ({ to, subject, html }) => {
  if (!resend) {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log(`\n[email:dev] to=${to}\n[email:dev] subject=${subject}\n[email:dev] ${text}\n`);
    return { dev: true };
  }
  return resend.emails.send({ from: EMAIL_FROM, to, subject, html });
};

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// Create a single-use token; store only its hash, return the raw token to email.
const createAuthToken = async (userId, type, ttlMinutes) => {
  const raw = crypto.randomBytes(32).toString('hex');
  await query(
    `INSERT INTO auth_tokens (user_id, token_hash, type, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [userId, hashToken(raw), type, String(ttlMinutes)]
  );
  return raw;
};

// Consume a valid, unexpired, unused token; returns the user row or null.
const consumeAuthToken = (raw, type) =>
  withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM auth_tokens
        WHERE token_hash = $1 AND type = $2 AND used_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [hashToken(raw), type]
    );
    const tok = rows[0];
    if (!tok) return null;
    await client.query('UPDATE auth_tokens SET used_at = now() WHERE id = $1', [tok.id]);
    const u = await client.query('SELECT * FROM users WHERE id = $1', [tok.user_id]);
    return u.rows[0] || null;
  });

const sendVerificationEmail = async (user) => {
  const raw = await createAuthToken(user.id, 'verify', VERIFY_TOKEN_TTL_MIN);
  const link = `${APP_URL}/verify-email?token=${raw}`;
  await sendEmail({
    to: user.email,
    subject: 'Verify your email — Contract Scanner',
    html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto;color:#0f1a18">
      <h2 style="color:#0f5c56;margin-bottom:8px">Verify your email</h2>
      <p>Hi ${user.first_name || 'there'}, thanks for signing up for Contract Scanner. Confirm your email to activate your account:</p>
      <p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#0d9488;color:#fff;padding:11px 22px;border-radius:10px;text-decoration:none;font-weight:600">Verify email</a></p>
      <p style="color:#6b7d78;font-size:13px">This link expires in ${VERIFY_TOKEN_TTL_MIN} minutes. If you didn’t create an account, you can safely ignore this email.</p>
      <p style="color:#93a39c;font-size:12px;word-break:break-all">Or paste this link into your browser:<br>${link}</p>
    </div>`,
  });
};

const sendPasswordResetEmail = async (user) => {
  const raw = await createAuthToken(user.id, 'reset', RESET_TOKEN_TTL_MIN);
  const link = `${APP_URL}/reset-password?token=${raw}`;
  await sendEmail({
    to: user.email,
    subject: 'Reset your password — Contract Scanner',
    html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto;color:#0f1a18">
      <h2 style="color:#0f5c56;margin-bottom:8px">Reset your password</h2>
      <p>Hi ${user.first_name || 'there'}, we received a request to reset your Contract Scanner password. Click below to choose a new one:</p>
      <p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#0d9488;color:#fff;padding:11px 22px;border-radius:10px;text-decoration:none;font-weight:600">Reset password</a></p>
      <p style="color:#6b7d78;font-size:13px">This link expires in ${RESET_TOKEN_TTL_MIN} minutes. If you didn’t request this, you can safely ignore this email — your password won’t change.</p>
      <p style="color:#93a39c;font-size:12px;word-break:break-all">Or paste this link into your browser:<br>${link}</p>
    </div>`,
  });
};

// Attach req.user when a valid bearer token is present (anonymous otherwise).
const authOptional = async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const { rows } = await query('SELECT * FROM users WHERE id = $1', [payload.sub]);
      if (rows[0]) req.user = rows[0];
    } catch {
      /* invalid/expired token → treat as anonymous */
    }
  }
  next();
};

const authRequired = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
};

// Which bucket the next analysis draws from, given a user row.
const previewDraw = (u) => {
  if (u.unlimited_until && new Date(u.unlimited_until).getTime() > Date.now()) return 'unlimited';
  if (u.free_trials_used < FREE_TRIAL_LIMIT) return 'free';
  if (u.credits_remaining > 0) return 'credit';
  return 'none';
};

// Parse `?page` / `?pageSize` query params into safe LIMIT/OFFSET values.
// page is 1-based; pageSize is clamped so a client can't request an unbounded page.
const parsePagination = (queryParams, { defaultSize = 10, maxSize = 50 } = {}) => {
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, parseInt(queryParams.pageSize, 10) || defaultSize));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
};

// ============================================================================
//  Auth routes
// ============================================================================
app.post('/api/auth/signup', authLimiter, async (req, res) => {
  const { firstName, lastName, email, phoneNumber, password } = req.body || {};
  if (!firstName || !email || !password) {
    return res.status(400).json({ error: 'First name, email, and password are required.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { rows } = await query(
      `INSERT INTO users (first_name, last_name, email, phone_number, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [firstName, lastName || null, email, phoneNumber || null, passwordHash]
    );
    const user = rows[0];
    // Block until verified: no session is issued here. Send the verification link.
    await sendVerificationEmail(user).catch((e) => console.error('Verification email failed:', e.message));
    return res.json({ pendingVerification: true, email: user.email });
  } catch (caught) {
    if (caught.code === '23505') {
      // Email already registered. If that account is still unverified, treat this
      // as "resend the verification link" rather than an error (no extra info leaked).
      const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
      const existing = rows[0];
      if (existing && !existing.email_verified) {
        await sendVerificationEmail(existing).catch((e) => console.error('Verification email failed:', e.message));
        return res.json({ pendingVerification: true, email: existing.email });
      }
      return res.status(409).json({ error: 'An account with that email already exists. Please log in.' });
    }
    console.error('signup error:', caught.message);
    return res.status(500).json({ error: 'Could not create your account. Please try again.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  try {
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    // Only reveal verification status to someone who passed the password check.
    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Please verify your email to continue. Check your inbox for the verification link.',
        needsVerification: true,
        email: user.email,
      });
    }
    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (caught) {
    console.error('login error:', caught.message);
    return res.status(500).json({ error: 'Could not sign you in. Please try again.' });
  }
});

// Public config the SPA needs before rendering the Google button. Returns null
// when Google sign-in isn't configured so the frontend simply hides the button.
app.get('/api/auth/config', (_req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID || null });
});

// Sign in / sign up with Google. The browser sends the GIS credential (an ID
// token); we verify it against Google, then find-or-create the user and issue
// our own session JWT — identical to the password login response shape.
app.post('/api/auth/google', authLimiter, async (req, res) => {
  if (!googleClient) return res.status(503).json({ error: 'Google sign-in is not configured.' });
  const credential = req.body?.credential;
  if (!credential) return res.status(400).json({ error: 'Missing Google credential.' });
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload() || {};
    const email = payload.email;
    // Google must have verified the email itself — otherwise it isn't proof of ownership.
    if (!email || !payload.email_verified) {
      return res.status(401).json({ error: 'Your Google account email is not verified.' });
    }

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    let user = rows[0];
    if (!user) {
      // Brand-new account: no password, email already proven, provider = google.
      const ins = await query(
        `INSERT INTO users (first_name, last_name, email, email_verified, auth_provider, provider_id)
         VALUES ($1, $2, $3, true, 'google', $4) RETURNING *`,
        [payload.given_name || email.split('@')[0], payload.family_name || null, email, payload.sub]
      );
      user = ins.rows[0];
    } else if (!user.email_verified) {
      // Existing password account signing in via Google with the same (Google-
      // verified) email — safe to mark verified so they're no longer blocked.
      const upd = await query(
        'UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1 RETURNING *',
        [user.id]
      );
      user = upd.rows[0];
    }

    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (caught) {
    return serverError(res, 'google auth', caught, { status: 401, message: 'Could not sign you in with Google.' });
  }
});

// Verify an email using the token from the verification link. Does NOT sign the
// user in — on success the SPA sends them to the login page.
app.post('/api/auth/verify-email', authLimiter, async (req, res) => {
  const token = req.body?.token;
  if (!token) return res.status(400).json({ error: 'Missing verification token.' });
  try {
    const user = await consumeAuthToken(token, 'verify');
    if (!user) return res.status(400).json({ error: 'This verification link is invalid or has expired.', expired: true });
    await query('UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1', [user.id]);
    return res.json({ verified: true, email: user.email });
  } catch (caught) {
    console.error('verify-email error:', caught.message);
    return res.status(500).json({ error: 'Could not verify your email. Please try again.' });
  }
});

// Resend a verification email. Always returns ok so it never reveals whether an
// address is registered. Only sends when the account exists and is unverified.
app.post('/api/auth/resend-verification', authLimiter, async (req, res) => {
  const email = req.body?.email;
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  try {
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (user && !user.email_verified) {
      // Invalidate any outstanding verify tokens, then issue a fresh one.
      await query(`UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND type = 'verify' AND used_at IS NULL`, [user.id]);
      await sendVerificationEmail(user).catch((e) => console.error('Resend verification failed:', e.message));
    }
    return res.json({ ok: true });
  } catch (caught) {
    console.error('resend-verification error:', caught.message);
    return res.json({ ok: true });
  }
});

// Request a password-reset link. Always returns ok so it never reveals whether
// an address is registered. Only sends when the account exists.
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  const email = req.body?.email;
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  try {
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (user) {
      // Invalidate any outstanding reset tokens, then issue a fresh one.
      await query(`UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND type = 'reset' AND used_at IS NULL`, [user.id]);
      await sendPasswordResetEmail(user).catch((e) => console.error('Password reset email failed:', e.message));
    }
    return res.json({ ok: true });
  } catch (caught) {
    console.error('forgot-password error:', caught.message);
    return res.json({ ok: true });
  }
});

// Complete a password reset using the token from the reset link. Sets the new
// password and (since receiving the email proves inbox ownership) marks the
// email verified. Does NOT sign the user in — the SPA sends them to login.
app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  const { token, password } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Missing reset token.' });
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  try {
    const user = await consumeAuthToken(token, 'reset');
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired.', expired: true });
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await query(
      'UPDATE users SET password_hash = $1, email_verified = true, updated_at = now() WHERE id = $2',
      [passwordHash, user.id]
    );
    return res.json({ reset: true, email: user.email });
  } catch (caught) {
    console.error('reset-password error:', caught.message);
    return res.status(500).json({ error: 'Could not reset your password. Please try again.' });
  }
});

app.get('/api/me', authOptional, authRequired, (req, res) => res.json({ user: publicUser(req.user) }));

// ============================================================================
//  Account — profile, usage stats, billing history, saved reports
// ============================================================================
app.get('/api/account', authOptional, authRequired, async (req, res) => {
  const uid = req.user.id;
  try {
    const [totals, byType, redFlags, payments] = await Promise.all([
      query('SELECT count(*)::int AS total, max(created_at) AS last FROM analyzed_records WHERE user_id = $1', [uid]),
      query('SELECT record_type, count(*)::int AS count FROM analyzed_records WHERE user_id = $1 GROUP BY record_type ORDER BY count DESC', [uid]),
      query(
        `SELECT COALESCE(sum(rc), 0)::int AS red FROM (
           SELECT (SELECT count(*) FROM jsonb_array_elements(analysis_report->'clauses') c WHERE c->>'riskLevel' = 'red') AS rc
           FROM analyzed_records WHERE user_id = $1
         ) t`,
        [uid]
      ),
      query('SELECT id, category, amount_cents, currency, status, created_at FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [uid]),
    ]);
    return res.json({
      user: publicUser(req.user),
      stats: {
        totalAnalyses: totals.rows[0].total,
        lastAnalyzedAt: totals.rows[0].last,
        redFlags: redFlags.rows[0].red,
        byType: byType.rows,
      },
      payments: payments.rows.map((p) => ({
        id: p.id,
        category: p.category,
        amountCents: p.amount_cents,
        currency: p.currency,
        status: p.status,
        createdAt: p.created_at,
      })),
    });
  } catch (caught) {
    return serverError(res, 'account dashboard error', caught);
  }
});

// List saved reports (metadata only) for the account history.
// Paginated via ?page & ?pageSize; response includes a `pagination` block so the
// client can render page controls without guessing the total.
app.get('/api/records', authOptional, authRequired, async (req, res) => {
  const { page, pageSize, limit, offset } = parsePagination(req.query, { defaultSize: 10, maxSize: 50 });
  try {
    const [countRes, listRes] = await Promise.all([
      query('SELECT count(*)::int AS total FROM analyzed_records WHERE user_id = $1', [req.user.id]),
      query(
        `SELECT id, record_type, created_at,
                analysis_report->'overallSummary'->>'verdict' AS verdict,
                jsonb_array_length(analysis_report->'clauses') AS clause_count,
                (SELECT count(*) FROM jsonb_array_elements(analysis_report->'clauses') c WHERE c->>'riskLevel' = 'red') AS red_count
           FROM analyzed_records WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      ),
    ]);
    const total = countRes.rows[0].total;
    return res.json({
      records: listRes.rows.map((r) => ({
        id: r.id,
        recordType: r.record_type,
        createdAt: r.created_at,
        verdict: r.verdict,
        clauseCount: Number(r.clause_count || 0),
        redCount: Number(r.red_count || 0),
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (caught) {
    return serverError(res, 'list records error', caught);
  }
});

// Full report for reopening.
app.get('/api/records/:id', authOptional, authRequired, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT analysis_report, record_type, created_at FROM analyzed_records WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Report not found.' });
    return res.json({ report: rows[0].analysis_report, recordType: rows[0].record_type, createdAt: rows[0].created_at });
  } catch (caught) {
    return serverError(res, 'get record error', caught);
  }
});

// Update profile (name + phone).
app.patch('/api/account', authOptional, authRequired, async (req, res) => {
  const { firstName, lastName, phoneNumber } = req.body || {};
  if (firstName !== undefined && !String(firstName).trim()) {
    return res.status(400).json({ error: 'Name cannot be empty.' });
  }
  try {
    const { rows } = await query(
      `UPDATE users
          SET first_name = COALESCE($2, first_name),
              last_name = $3,
              phone_number = $4,
              updated_at = now()
        WHERE id = $1 RETURNING *`,
      [
        req.user.id,
        firstName !== undefined ? String(firstName).trim() : null,
        lastName !== undefined ? lastName : req.user.last_name,
        phoneNumber !== undefined ? phoneNumber : req.user.phone_number,
      ]
    );
    return res.json({ user: publicUser(rows[0]) });
  } catch (caught) {
    return serverError(res, 'update profile error', caught);
  }
});

// Change password (requires the current one).
app.post('/api/account/password', authOptional, authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords are required.' });
  if (String(newPassword).length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  try {
    const ok = await bcrypt.compare(currentPassword, req.user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [req.user.id, passwordHash]);
    return res.json({ ok: true });
  } catch (caught) {
    return serverError(res, 'change password error', caught);
  }
});

// Delete the account (cascades to payments + records).
app.delete('/api/account', authOptional, authRequired, async (req, res) => {
  try {
    await query('DELETE FROM users WHERE id = $1', [req.user.id]);
    return res.json({ ok: true });
  } catch (caught) {
    return serverError(res, 'delete account error', caught);
  }
});

// ============================================================================
//  Billing
// ============================================================================

// Apply a plan's entitlement to a user (within a caller-supplied transaction).
const grantEntitlement = (client, userId, plan) =>
  plan.unlimitedDays
    ? client.query(
        `UPDATE users
            SET subscription_type = 'unlimited',
                unlimited_until = GREATEST(COALESCE(unlimited_until, now()), now()) + ($2 || ' days')::interval,
                updated_at = now()
          WHERE id = $1 RETURNING *`,
        [userId, String(plan.unlimitedDays)]
      )
    : client.query(
        `UPDATE users
            SET subscription_type = $2,
                credits_remaining = credits_remaining + $3,
                updated_at = now()
          WHERE id = $1 RETURNING *`,
        [userId, plan.category, plan.credits]
      );

// Record a payment + grant entitlement, idempotently keyed on the charge id.
// Returns true if it fulfilled, false if this charge was already processed.
const fulfillPurchase = (userId, plan, { chargeId, customerId }) =>
  withTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO payments (user_id, payment_type, category, amount_cents, currency, status, processor_charge_id)
       VALUES ($1, 'card', $2, $3, 'USD', 'succeeded', $4)
       ON CONFLICT (processor_charge_id) DO NOTHING
       RETURNING id`,
      [userId, plan.category, plan.amountCents, chargeId]
    );
    if (inserted.rowCount === 0) return false; // already fulfilled (webhook retry)
    if (customerId) {
      await client.query('UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, $2) WHERE id = $1', [userId, customerId]);
    }
    await grantEntitlement(client, userId, plan);
    return true;
  });

// Frontend needs the publishable key to mount Stripe Elements.
app.get('/api/billing/config', (_req, res) => {
  res.json({ publishableKey: STRIPE_PUBLISHABLE_KEY || null, enabled: !!stripe });
});

// Create a PaymentIntent for an on-site (Payment Element) checkout.
// Returns a client_secret the browser uses to confirm the card inline.
app.post('/api/billing/payment-intent', authOptional, authRequired, async (req, res) => {
  const planId = req.body?.plan;
  const plan = PLAN_CATALOG[planId];
  if (!plan) return res.status(400).json({ error: 'Unknown plan.' });
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured on the server.' });

  try {
    const intent = await stripe.paymentIntents.create({
      amount: plan.amountCents,
      currency: 'usd',
      // Card only — covers both credit and debit. Explicitly listing the type
      // (instead of automatic_payment_methods) suppresses Cash App Pay,
      // Amazon Pay, Link, and every other wallet/redirect method.
      payment_method_types: ['card'],
      receipt_email: req.user.email,
      description: plan.unlimitedDays ? `Unlimited analyses for ${plan.unlimitedDays} days` : `${plan.credits} contract analyses`,
      // The webhook reads this metadata to fulfill the right plan for the right user.
      metadata: { userId: req.user.id, planId },
    });
    return res.json({ clientSecret: intent.client_secret });
  } catch (caught) {
    return serverError(res, 'payment-intent error', caught, { message: 'Could not start checkout. Please try again.' });
  }
});

// Confirm an on-site PaymentIntent and fulfill it. This is the sole fulfillment
// path after an inline card succeeds. We re-fetch the intent from Stripe — never
// trust the client's claim that it succeeded — and verify it belongs to the
// authenticated user. fulfillPurchase is idempotent on the charge id, so a
// double-submit can't double-credit.
app.post('/api/billing/confirm', authOptional, authRequired, async (req, res) => {
  const paymentIntentId = req.body?.paymentIntentId;
  if (!paymentIntentId) return res.status(400).json({ error: 'Missing paymentIntentId.' });
  if (!stripe) return res.status(503).json({ error: 'Stripe is not configured on the server.' });

  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (String(intent.metadata?.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'This payment does not belong to you.' });
    }
    if (intent.status !== 'succeeded') {
      return res.status(409).json({ error: `Payment not completed (status: ${intent.status}).` });
    }
    const plan = PLAN_CATALOG[intent.metadata?.planId];
    if (!plan) return res.status(400).json({ error: 'Unknown plan on payment.' });

    // Writes the payments row (user_id, charge id, amount, status…) and updates
    // the user's subscription_type / credits_remaining / unlimited_until.
    // Idempotent on processor_charge_id, so a later webhook for the same charge no-ops.
    const fulfilled = await fulfillPurchase(req.user.id, plan, { chargeId: intent.id, customerId: intent.customer });
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    return res.json({ fulfilled, user: publicUser(rows[0]) });
  } catch (caught) {
    return serverError(res, 'billing confirm error', caught, { message: 'Could not confirm your payment. Please try again.' });
  }
});

// Start checkout. With Stripe configured we return a hosted Checkout URL;
// without it, we fall back to an instant mock grant for local development.
app.post('/api/billing/checkout', authOptional, authRequired, async (req, res) => {
  const planId = req.body?.plan;
  const plan = PLAN_CATALOG[planId];
  if (!plan) return res.status(400).json({ error: 'Unknown plan.' });

  // --- Mock fallback (no Stripe key) ---
  if (!stripe) {
    try {
      const fulfilled = await fulfillPurchase(req.user.id, plan, { chargeId: `mock_${Date.now()}_${req.user.id}` });
      const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
      return res.json({ mock: true, fulfilled, user: publicUser(rows[0]) });
    } catch (caught) {
      return serverError(res, 'mock checkout error', caught, { message: 'Could not complete checkout. Please try again.' });
    }
  }

  // --- Real Stripe Checkout ---
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'], // card only — no wallets or alternative methods
      customer_email: req.user.email,
      client_reference_id: req.user.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: plan.amountCents,
            product_data: {
              name: `Contract Scanner — ${plan.category[0].toUpperCase()}${plan.category.slice(1)}`,
              description: plan.unlimitedDays ? `Unlimited analyses for ${plan.unlimitedDays} days` : `${plan.credits} contract analyses`,
            },
          },
        },
      ],
      // Metadata is what the webhook reads to fulfill the right plan for the right user.
      metadata: { userId: req.user.id, planId },
      payment_intent_data: { metadata: { userId: req.user.id, planId } },
      success_url: `${APP_URL}/?checkout=success`,
      cancel_url: `${APP_URL}/?checkout=cancel`,
    });
    return res.json({ url: session.url });
  } catch (caught) {
    return serverError(res, 'stripe checkout error', caught, { message: 'Could not start checkout. Please try again.' });
  }
});

app.get('/api/health', async (_req, res) =>
  res.json({ ok: true, db: await dbHealthy(), stripe: !!stripe })
);

const extractJson = (raw) => {
  const trimmed = raw?.trim() || '';
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1) {
    throw new Error('No JSON object found in the model response.');
  }
  return JSON.parse(trimmed.slice(first, last + 1));
};

const MAX_LEASE_CHARS = 18000;

// Each contract type defines who we protect, what to scrutinize, and a
// keyword heuristic used to sanity-check the uploaded text.
const CONTRACT_TYPES = {
  lease: {
    label: 'Residential Lease',
    audience: 'renter (tenant)',
    analyst: 'residential lease and rental agreements',
    focus:
      'unfair fees, entry/privacy rights, repair obligations, security-deposit handling, early termination, automatic renewal, rent increases, and missing renter protections',
    keywords:
      /(lease|tenant|landlord|rent|deposit|notice|term|occupancy|premises|late fee|termination|renewal|utilities|sublet)/i,
  },
  employment: {
    label: 'Employment Contract',
    audience: 'employee',
    analyst: 'employment, offer, and contractor agreements',
    focus:
      'compensation and bonus terms, at-will/termination, non-compete and non-solicit, IP/invention assignment, confidentiality, mandatory arbitration, severance, equity vesting, PTO, and clawbacks',
    keywords:
      /(employ|employee|employer|salary|compensation|wage|benefits|termination|at-will|non-?compete|confidential|severance|stock|equity|vesting|probation|notice period)/i,
  },
  property: {
    label: 'Property Purchase / Sale',
    audience: 'buyer',
    analyst: 'real-estate purchase and sale agreements',
    focus:
      'purchase price and deposits, earnest money, contingencies (financing, inspection, appraisal), title and liens, closing costs allocation, disclosures, default remedies, and possession date',
    keywords:
      /(purchase|seller|buyer|property|escrow|earnest|closing|title|deed|contingency|inspection|appraisal|mortgage|conveyance|possession|premises)/i,
  },
  general: {
    label: 'General Contract',
    audience: 'signing party',
    analyst: 'general commercial and personal contracts',
    focus:
      'payment terms, scope of obligations, liability caps, indemnification, termination rights, dispute resolution, auto-renewal, late fees, and one-sided or unusual clauses',
    keywords:
      /(agreement|party|parties|terms|obligation|liability|indemnif|termination|warranty|breach|payment|confidential|governing law)/i,
  },
};

const resolveContractType = (id) => CONTRACT_TYPES[id] ? id : 'lease';

const compactLeaseText = (text) => {
  if (!text) return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > MAX_LEASE_CHARS ? normalized.slice(0, MAX_LEASE_CHARS) : normalized;
};

// fetch with an abort timeout + one retry on network / 5xx failures
const fetchWithTimeout = async (url, options, { timeoutMs = 45000, retries = 1 } = {}) => {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      // Retry once on transient upstream errors
      if (response.status >= 500 && attempt < retries) continue;
      return response;
    } catch (caught) {
      clearTimeout(timer);
      const isAbort = caught?.name === 'AbortError';
      if (attempt < retries && !isAbort) continue;
      if (isAbort) throw new Error('The analysis timed out. Please try again with a shorter lease.');
      throw caught;
    }
  }
};

const looksLikeReadableText = (text, contractTypeId = 'lease') => {
  if (!text) return false;
  const normalized = text.replace(/\s+/g, ' ').trim();
  const hasLetters = /[A-Za-z]/.test(normalized);
  const wordCount = normalized.split(' ').filter(Boolean).length;
  const cfg = CONTRACT_TYPES[contractTypeId] || CONTRACT_TYPES.lease;
  const hasContractTerms = cfg.keywords.test(normalized);
  // Accept if it reads like the chosen contract type OR is clearly prose.
  return hasLetters && (hasContractTerms || wordCount >= 20);
};

const extractTextFromPdf = async (buffer) => {
  // Lazy-load: pdfjs touches DOMMatrix at import time. @napi-rs/canvas provides
  // that polyfill; loading here (not at top level) keeps a failure contained to
  // PDF requests instead of crashing the whole serverless function on cold start.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const pdfDoc = await loadingTask.promise;
  let extractedText = '';
  for (let pageIndex = 1; pageIndex <= pdfDoc.numPages; pageIndex += 1) {
    const page = await pdfDoc.getPage(pageIndex);
    const content = await page.getTextContent();
    extractedText += content.items.map((item) => item.str).join(' ') + '\n\n';
  }
  return compactLeaseText(extractedText);
};

const extractTextFromDocx = async (buffer) => {
  const result = await mammoth.extractRawText({ buffer });
  return compactLeaseText(result.value || '');
};

const extractTextFromImage = async (buffer) => {
  await ensureWorker();
  const { data: { text } } = await worker.recognize(buffer);
  return compactLeaseText(text);
};

app.post('/api/analyze', authOptional, analyzeLimiter, upload.single('leaseFile'), async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server missing OPENAI_API_KEY. Set it in .env.' });
  }

  // Entitlement gate (server-enforced for signed-in users). Anonymous callers
  // get the one-time free trial; the SPA tracks that locally.
  if (req.user && previewDraw(req.user) === 'none') {
    return res.status(402).json({
      error: 'You’ve used all your analyses. Choose a plan to continue.',
      needsPlan: true,
      user: publicUser(req.user),
    });
  }

  const pastedLeaseText = (req.body?.leaseText || '').trim();
  const contractTypeId = resolveContractType(req.body?.contractType);
  const contractCfg = CONTRACT_TYPES[contractTypeId];
  let extractedText = '';

  if (req.file) {
    try {
      const mimeType = req.file.mimetype.toLowerCase();
      if (mimeType === 'application/pdf') {
        extractedText = await extractTextFromPdf(req.file.buffer);
      } else if (mimeType === 'text/plain') {
        extractedText = compactLeaseText(req.file.buffer.toString('utf8'));
      } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        extractedText = await extractTextFromDocx(req.file.buffer);
      } else if (mimeType.startsWith('image/')) {
        extractedText = await extractTextFromImage(req.file.buffer);
      } else {
        return res.status(400).json({ error: 'Unsupported file type. Please upload a PDF, TXT, DOCX, or image file.' });
      }
    } catch (caught) {
      return serverError(res, 'file extraction error', caught, {
        status: 400,
        message: 'We couldn’t read that file. Please upload a clear PDF, TXT, DOCX, or image.',
      });
    }
  }

  const leaseText = pastedLeaseText || extractedText;

  if (!leaseText) {
    if (req.file && !extractedText) {
      return res.status(400).json({
        error: 'Uploaded PDF contains no selectable text. Please use a text-based PDF or paste the lease text manually.',
      });
    }
    return res.status(400).json({ error: 'leaseText or a PDF file is required.' });
  }

  if (!looksLikeReadableText(leaseText, contractTypeId)) {
    return res.status(400).json({
      error: `The content does not look like a readable ${contractCfg.label}. Paste plain text or upload a text-based file rather than a scanned or binary one.`,
    });
  }

  try {
    const messages = [
      {
        role: 'system',
        content: `You are a meticulous contract analyzer specializing in ${contractCfg.analyst}. You review strictly on behalf of the ${contractCfg.audience} and flag anything unfair, risky, or non-standard for them. Return ONLY valid JSON in the response body. Use only the exact JSON shape requested with no extra text.`,
      },
      {
        role: 'user',
        content: `Analyze this ${contractCfg.label} on behalf of the ${contractCfg.audience}. Pay special attention to: ${contractCfg.focus}. For each notable clause, set riskLevel to "red" (clearly unfavorable/risky), "yellow" (worth reviewing/negotiating), or "green" (standard/fair), give a plain-English summary, and where useful a short negotiationScript the ${contractCfg.audience} could say. In "missingProtections", list protections a fair ${contractCfg.label} should include for the ${contractCfg.audience} but this one omits.\n\nReturn JSON exactly in this shape:\n{\n  \"clauses\": [\n    {\"text\": string, \"riskLevel\": \"green\"|\"yellow\"|\"red\", \"summary\": string, \"negotiationScript\"?: string}\n  ],\n  \"missingProtections\": [string],\n  \"overallSummary\": {\"verdict\": string, \"topFixes\": [string]}\n}\n\nContract text:\n${leaseText}`,
      },
    ];

    const model = 'gpt-4.1-mini';
    const response = await fetchWithTimeout(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        // Roomy budget so multi-clause contracts don't get truncated mid-JSON.
        max_tokens: 4000,
        temperature: 0.2,
        // Ask the API to guarantee a syntactically valid JSON object.
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const modelText = choice?.message?.content || '';

    // The model can still overflow the token budget on very long contracts. If
    // parsing fails, return a friendly, actionable message — never leak the raw
    // JSON.parse error (e.g. "Expected ',' ... at position 3993") to the user.
    let parsed;
    try {
      parsed = extractJson(modelText);
    } catch (parseErr) {
      const truncated = choice?.finish_reason === 'length';
      console.error(
        `Analysis JSON parse failed: ${parseErr.message} | finish_reason=${choice?.finish_reason} | rawLength=${modelText.length}`
      );
      return res.status(502).json({
        error: truncated
          ? 'This contract is long, so the analysis was cut off before it finished. Try analyzing one agreement (or a shorter section) at a time.'
          : 'We couldn’t read the analysis result this time. Please try again in a moment.',
        retryable: true,
      });
    }

    // Surface processing facts to the client (so it can warn about truncation, etc.)
    parsed.meta = {
      model,
      charCount: leaseText.length,
      truncated: leaseText.length >= MAX_LEASE_CHARS,
      source: req.file ? req.file.mimetype : 'pasted-text',
      contractType: contractTypeId,
      contractTypeLabel: contractCfg.label,
    };

    // For signed-in users: atomically consume one unit of access AND persist the
    // report — both in a single transaction so they can never diverge.
    if (req.user) {
      const result = await withTransaction(async (client) => {
        const { rows } = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.user.id]);
        const fresh = rows[0];
        const draw = previewDraw(fresh);
        if (draw === 'none') return { draw }; // exhausted between gate and now (rare race)

        if (draw === 'free') {
          await client.query('UPDATE users SET free_trials_used = free_trials_used + 1, updated_at = now() WHERE id = $1', [req.user.id]);
        } else if (draw === 'credit') {
          await client.query('UPDATE users SET credits_remaining = credits_remaining - 1, updated_at = now() WHERE id = $1', [req.user.id]);
        }

        await client.query(
          `INSERT INTO analyzed_records (user_id, record_type, analysis_report, char_count, source)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.id, contractTypeId, JSON.stringify(parsed), leaseText.length, parsed.meta.source]
        );

        const refreshed = await client.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        return { draw, user: refreshed.rows[0] };
      });

      if (result.draw === 'none') {
        return res.status(402).json({ error: 'You’ve used all your analyses. Choose a plan to continue.', needsPlan: true });
      }
      parsed.meta.drawnFrom = result.draw;
      parsed.meta.user = publicUser(result.user); // let the SPA sync entitlement
    }

    return res.json(parsed);
  } catch (caught) {
    return serverError(res, 'analyze error', caught, { message: 'We couldn’t analyze that contract. Please try again.' });
  }
});

// ============================================================================
//  Static SPA hosting (single-origin production)
// ============================================================================
// In production the built frontend (Vite → dist/) is served by this same Express
// process, so the app and API share one origin: no CORS needed, and client-side
// routes (/verify-email, /reset-password, /account, …) resolve on direct load
// and refresh. When there's no build — local dev, where Vite serves the frontend
// on :5173 — this block is skipped and the server stays API-only.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');

if (existsSync(INDEX_HTML)) {
  // Unknown /api/* routes return JSON 404 — never the SPA shell — so a mistyped
  // endpoint fails loudly instead of returning HTML that a fetch can't parse.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  // Hashed build assets are safe to cache long-term; index.html is served
  // uncached by the fallback below so a new deploy is picked up immediately.
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1y', etag: true }));

  // SPA fallback: every other GET returns index.html for client-side routing.
  app.get('*', (_req, res) => res.sendFile(INDEX_HTML));

  console.log(`Serving SPA build from ${DIST_DIR}`);
} else {
  console.log('No dist/ build found — running API-only (frontend served by Vite in dev).');
}

// Safety net: any error a route handler didn't catch lands here — reported to
// Sentry and returned as a generic message (never a stack trace to the client).
app.use((err, _req, res, _next) => {
  console.error('Unhandled route error:', err instanceof Error ? err.message : err);
  captureError(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const startServer = () => {
  const server = app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`Port ${PORT} is already in use. Attempting to free it...`);
      try {
        const pids = execFileSync('lsof', ['-ti', `:${PORT}`], { encoding: 'utf8' })
          .trim()
          .split('\n')
          .filter(Boolean);
        if (pids.length) {
          execFileSync('kill', ['-9', ...pids]);
        }
      } catch {
        // Ignore if no process is bound.
      }
      setTimeout(() => {
        startServer();
      }, 500);
      return;
    }
    console.error(error);
  });
};

// Only bind a port when run directly (local dev: `node server.js`, and the smoke
// tests). On serverless hosts like Vercel the platform imports the exported `app`
// and invokes it per request, so it must NOT call app.listen() there.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

export default app;
