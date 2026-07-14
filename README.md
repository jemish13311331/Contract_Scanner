# Contract Red-Flag Scanner

AI-powered contract review that turns a dense lease, job offer, or purchase
agreement into a plain-English, clause-by-clause risk report — flagging unfair,
risky, or non-standard terms and suggesting how to negotiate them.

Paste text or upload a PDF/DOCX/TXT/image; the app extracts the text, analyzes
it with an LLM, and returns structured findings (risk-scored clauses, missing
protections, an overall verdict, and negotiation prompts).

> **Not legal advice.** The analysis is informational only. Confirm important
> terms with a licensed attorney before signing.

---

## Features

- **Multiple contract types** — residential lease, employment/offer, property
  purchase & sale, and general contracts, each reviewed from the signer's side
  with type-specific focus areas.
- **Flexible input** — paste raw text or upload **PDF, DOCX, TXT, or an image**.
  Text-based files are parsed directly; images (and scanned pages) go through
  **OCR** (Tesseract).
- **Structured output** — each clause gets a `green` / `yellow` / `red` risk
  level, a plain-English summary, and (where useful) a negotiation script; plus
  a list of missing protections and an overall verdict.
- **Accounts & entitlements** — email/password signup with verification,
  "Continue with Google", and password reset. One free trial, then credit- or
  subscription-based access, all **server-enforced**.
- **Payments** — Stripe (Payment Element) for credit packs and an unlimited
  plan; saved report history for signed-in users.
- **Hardening** — Helmet security headers, per-IP/user rate limiting, JWT auth,
  bcrypt password hashing, and optional Sentry error reporting.

---

## Tech stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React 18, Vite, MUI icons, Stripe.js / React Stripe Elements |
| Backend    | Node.js + Express (`server.js`) |
| Database   | PostgreSQL (`pg`) |
| LLM        | OpenAI Chat Completions (`gpt-4.1-mini`) |
| Extraction | `pdfjs-dist` (PDF), `mammoth` (DOCX), `tesseract.js` (image OCR) |
| Auth       | `jsonwebtoken`, `bcryptjs`, `google-auth-library` |
| Email      | Resend (verification & password-reset links) |
| Payments   | Stripe |
| Monitoring | Sentry (optional) |

In **production** the built frontend (`dist/`) is served by the same Express
process as the API, so the app and API share one origin (no CORS). In **dev**,
Vite serves the frontend on `:5173` and proxies `/api` to Express on `:4000`.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the application design and
[`db/README.md`](db/README.md) for the database schema and ER diagram.

---

## Prerequisites

- **Node.js 18+** (uses the built-in test runner and `node --watch`)
- **PostgreSQL 14+** (a reachable `DATABASE_URL`)
- An **OpenAI API key**
- *Optional:* Stripe, Google OAuth, Resend, and Sentry credentials for the
  respective features

---

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env` file in the project root (see the [full list](#environment-variables)):

```bash
# Required
OPENAI_API_KEY=sk-...
DATABASE_URL=postgres://user:pass@localhost:5432/contract_scanner
JWT_SECRET=change-me-to-a-long-random-string

# Recommended in dev
APP_URL=http://localhost:5173
PORT=4000
```

### 3. Set up the database

```bash
# Create the schema
psql "$DATABASE_URL" -f db/schema.sql

# Apply migrations (in order)
node db/run-migration.mjs db/migrations/001_email_verification.sql
node db/run-migration.mjs db/migrations/002_social_auth.sql
```

### 4. Run in development

```bash
npm run dev
```

This starts Vite (`http://localhost:5173`) and the Express backend
(`http://localhost:4000`) concurrently, with `/api` proxied to the backend.
Open **http://localhost:5173**.

### 5. Build & run for production

```bash
npm run build   # bundles the frontend into dist/
npm start       # Express serves the API + dist/ on one origin (PORT, default 4000)
```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | ✅ | OpenAI key used for contract analysis. |
| `DATABASE_URL` | ✅ | PostgreSQL connection string. |
| `JWT_SECRET` | ✅ | Secret for signing auth tokens. |
| `PORT` | — | Backend port (default `4000`). |
| `APP_URL` | — | Public app URL used in email links (default `http://localhost:5173`). |
| `NODE_ENV` | — | `production` enables prod behaviors (static serving, HTTPS). |
| `TRUST_PROXY` | — | Number of proxy hops to trust for correct client IPs (default `0`). |
| `FORCE_HTTPS` | — | Redirect to HTTPS in production behind a TLS proxy. |
| `JWT_EXPIRES_IN` | — | Token lifetime (e.g. `7d`). |
| `PG_POOL_MAX` | — | Max Postgres pool connections. |
| `PGSSL` | — | Enable SSL for the Postgres connection. |
| `STRIPE_SECRET_KEY` | for payments | Stripe secret key. |
| `STRIPE_PUBLISHABLE_KEY` | for payments | Stripe publishable key (sent to the client). |
| `GOOGLE_CLIENT_ID` | for Google sign-in | Google OAuth client ID. |
| `RESEND_API_KEY` | for emails | Resend API key for verification/reset emails. |
| `EMAIL_FROM` | for emails | From-address for outbound email. |
| `SENTRY_DSN` | — | Enable Sentry error reporting. |
| `SENTRY_TRACES_SAMPLE_RATE` | — | Sentry tracing sample rate (`0`–`1`). |

Features whose credentials are absent degrade gracefully (e.g. Google sign-in
and payments simply don't appear).

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run frontend (Vite) + backend concurrently. |
| `npm run dev:frontend` | Vite dev server only. |
| `npm run dev:backend` | Express with `--watch` only. |
| `npm run build` | Build the frontend into `dist/`. |
| `npm run preview` | Preview the production build locally. |
| `npm start` | Run the Express server (serves API + `dist/`). |
| `npm test` | Run all tests in `test/`. |
| `npm run test:smoke` | Run the HTTP smoke tests (boot the real server; skips if no DB). |

---

## Testing

- **Unit tests** use Node's built-in test runner (`node --test`).
- **Smoke tests** (`test/smoke.test.mjs`) boot the real server as a subprocess
  and drive it over HTTP to exercise the full middleware stack. They need a
  reachable Postgres (via `DATABASE_URL`); if none is found, the suite skips
  itself rather than failing. No OpenAI or Stripe keys are required — the
  analyze test hits input validation before any model call, and the payment
  test uses the keyless mock-checkout path.

```bash
npm test
```

---

## Project structure

```
.
├── server.js             # Express API + (in prod) static hosting of dist/
├── App.jsx               # React SPA (main application)
├── AuthPages.jsx         # Standalone auth pages (verify email, forgot/reset password)
├── LegalPages.jsx        # /privacy and /terms
├── index.html            # HTML shell + SEO/OpenGraph/structured data
├── src/
│   └── main.jsx          # React entry point
├── db/
│   ├── schema.sql        # PostgreSQL schema
│   ├── migrations/       # Ordered SQL migrations
│   ├── run-migration.mjs # Tiny migration runner
│   ├── index.js          # pg pool + query/transaction helpers
│   └── README.md         # Schema docs + ER diagram
├── public/               # Static assets (logo, OG image, robots, sitemap)
├── test/                 # Unit + smoke tests
├── ARCHITECTURE.md       # Application architecture notes
└── vite.config.js        # Vite config (dev server + /api proxy)
```

---

## Database

PostgreSQL with five core tables — `users`, `payment_methods`, `payments`,
`analyzed_records`, and `auth_tokens`. Highlights: UUID primary keys, bcrypt
password **hashes** (never plaintext), tokenized payment methods (no raw card
data, PCI-safe), and analysis reports stored as queryable `JSONB`. Full schema,
relationships, and design decisions are documented in
[`db/README.md`](db/README.md).

---

## License

Private / unpublished. All rights reserved.
