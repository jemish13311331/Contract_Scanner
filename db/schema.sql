-- ============================================================================
--  Contract Red-Flag Scanner — PostgreSQL schema
--  Derived from the User / Payments / Analyzed_Records data model.
--
--  Design notes / deviations from the raw sketch (intentional, important):
--   • "Password" is stored ONLY as a hash (bcrypt/argon2) — never plaintext.
--   • "Saved_Card_Info" / "Card_Info" are NOT stored as raw card data.
--     Storing PANs/CVV is a PCI-DSS violation. Cards live at the payment
--     processor (e.g. Stripe); we persist only a token + brand/last4/expiry
--     in `payment_methods`.
--   • Added the foreign keys implied by the diagram's arrows
--     (payments.user_id, analyzed_records.user_id, analyzed_records.payment_id).
--   • Added billing/entitlement columns the app actually needs
--     (credits_remaining, unlimited_until, amount/status on payments).
--
--  Apply with:  psql "$DATABASE_URL" -f db/schema.sql
-- ============================================================================

BEGIN;

-- --- Extensions -------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email

-- --- Enumerated types -------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE subscription_type AS ENUM ('free', 'starter', 'pro', 'unlimited');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method_kind AS ENUM ('card', 'paypal', 'apple_pay', 'google_pay', 'bank_transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- "Category" of what was bought — maps to our plan tiers / top-ups.
DO $$ BEGIN
  CREATE TYPE payment_category AS ENUM ('starter', 'pro', 'unlimited', 'top_up');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- "Record_Type" — the kind of contract analyzed (matches CONTRACT_TYPES).
DO $$ BEGIN
  CREATE TYPE record_type AS ENUM ('lease', 'employment', 'property', 'general', 'insurance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --- Shared trigger: keep updated_at current ---------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
--  users
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name         TEXT        NOT NULL,
  last_name          TEXT,
  email              CITEXT      NOT NULL UNIQUE,
  phone_number       TEXT,
  password_hash      TEXT        NOT NULL,           -- bcrypt/argon2 hash, NOT plaintext
  email_verified     BOOLEAN     NOT NULL DEFAULT false,  -- set true once the email link is clicked
  subscription_type  subscription_type NOT NULL DEFAULT 'free',

  -- Entitlement / metering (drives the freemium gate in the app)
  credits_remaining  INTEGER     NOT NULL DEFAULT 0 CHECK (credits_remaining >= 0),
  free_trials_used   INTEGER     NOT NULL DEFAULT 0 CHECK (free_trials_used >= 0),
  unlimited_until    TIMESTAMPTZ,                    -- non-null while an Unlimited plan is active

  -- Billing linkage (the customer record lives at the processor)
  stripe_customer_id TEXT UNIQUE,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT email_format CHECK (position('@' IN email) > 1)
);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
--  payment_methods  (replaces raw "Saved_Card_Info" — tokenized, PCI-safe)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             payment_method_kind NOT NULL DEFAULT 'card',

  -- The ONLY card reference we keep — an opaque processor token (e.g. pm_xxx).
  processor        TEXT NOT NULL DEFAULT 'stripe',
  processor_token  TEXT NOT NULL,

  -- Safe, displayable metadata (allowed by PCI for UI like "Visa •••• 4242").
  brand            TEXT,
  last4            CHAR(4),
  exp_month        SMALLINT CHECK (exp_month BETWEEN 1 AND 12),
  exp_year         SMALLINT CHECK (exp_year BETWEEN 2000 AND 2100),
  is_default       BOOLEAN NOT NULL DEFAULT false,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (processor, processor_token)
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);
-- At most one default card per user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_methods_default
  ON payment_methods(user_id) WHERE is_default;

-- ============================================================================
--  payments
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  payment_type        payment_method_kind NOT NULL DEFAULT 'card',
  category            payment_category    NOT NULL,
  payment_method_id   UUID REFERENCES payment_methods(id) ON DELETE SET NULL,

  amount_cents        INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency            CHAR(3) NOT NULL DEFAULT 'USD',
  status              payment_status NOT NULL DEFAULT 'pending',
  processor_charge_id TEXT UNIQUE,                 -- e.g. Stripe PaymentIntent id

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payments_user        ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at  ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status      ON payments(status);

-- ============================================================================
--  analyzed_records
-- ============================================================================
CREATE TABLE IF NOT EXISTS analyzed_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Which payment "paid" for this analysis. NULL = covered by the free trial.
  payment_id       UUID REFERENCES payments(id) ON DELETE SET NULL,

  record_type      record_type NOT NULL,
  analysis_report  JSONB       NOT NULL,           -- the structured result we return
  char_count       INTEGER CHECK (char_count >= 0),
  source           TEXT,                            -- 'pasted-text', 'application/pdf', ...

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_records_user        ON analyzed_records(user_id);
CREATE INDEX IF NOT EXISTS idx_records_payment     ON analyzed_records(payment_id);
CREATE INDEX IF NOT EXISTS idx_records_type        ON analyzed_records(record_type);
CREATE INDEX IF NOT EXISTS idx_records_created_at  ON analyzed_records(created_at DESC);
-- Query inside the JSON report (e.g. WHERE analysis_report -> 'overallSummary' ...).
CREATE INDEX IF NOT EXISTS idx_records_report_gin  ON analyzed_records USING GIN (analysis_report);

-- ============================================================================
--  auth_tokens  (single-use tokens for email verification & password reset)
-- ============================================================================
CREATE TABLE IF NOT EXISTS auth_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,                     -- SHA-256 of the raw token; raw is emailed, never stored
  type        TEXT NOT NULL CHECK (type IN ('verify','reset')),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,                        -- non-null once consumed (single-use)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);

COMMIT;
