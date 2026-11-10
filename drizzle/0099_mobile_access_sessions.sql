-- Short-lived development mobile sessions, independent of web tab cookies.
CREATE TABLE IF NOT EXISTS mobile_access_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS mobile_access_sessions_expiry ON mobile_access_sessions(expires_at);
