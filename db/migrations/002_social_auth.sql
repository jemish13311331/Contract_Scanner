-- Migration 002 — social auth (Google sign-in)
-- Social accounts have no password, so password_hash becomes nullable and we
-- track which provider a user came from. Existing rows are 'password' users.

BEGIN;

-- Social users never set a password.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- 'password' | 'google' (room for 'apple' etc. later). Existing rows default in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password';

-- The provider's stable subject id (Google `sub`). Null for password accounts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id TEXT;

-- One account per (provider, subject). Partial index so many NULLs are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider
  ON users(auth_provider, provider_id) WHERE provider_id IS NOT NULL;

COMMIT;
