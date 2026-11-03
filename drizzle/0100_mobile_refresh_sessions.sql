CREATE TABLE IF NOT EXISTS mobile_refresh_sessions (
 token_hash TEXT PRIMARY KEY NOT NULL,
 account_id TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS mobile_refresh_sessions_expiry ON mobile_refresh_sessions(expires_at);
