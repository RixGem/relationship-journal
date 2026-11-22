-- Migration 0003: Single-owner Passkey (WebAuthn) lock & ephemeral challenge store
-- Enforces at the SQLite constraint level (`slot = 1`) that only ONE passkey can ever be registered.

CREATE TABLE IF NOT EXISTS passkey_credentials (
  slot INTEGER PRIMARY KEY CHECK (slot = 1),
  credential_id TEXT NOT NULL UNIQUE,
  public_key_spki TEXT NOT NULL,
  algorithm INTEGER NOT NULL DEFAULT -7,
  sign_count INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT 'Owner Passkey',
  rp_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS passkey_challenges (
  challenge TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
  rp_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires
  ON passkey_challenges (expires_at);
