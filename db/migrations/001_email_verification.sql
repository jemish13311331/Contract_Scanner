-- Migration 001 — email verification
-- Adds the email_verified flag and the auth_tokens table (verify + reset tokens).
-- Existing accounts are grandfathered as verified so they aren't locked out.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;

-- One-time: mark all pre-existing accounts as verified.
UPDATE users SET email_verified = true WHERE email_verified = false;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('verify','reset')),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);

COMMIT;
