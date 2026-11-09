#!/usr/bin/env python3
"""Validate mobile D1 session table DDL in disposable SQLite memory only.

This does NOT connect to Cloudflare, open production databases, or apply live migrations.
"""
from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parents[1]
conn = sqlite3.connect(":memory:")
conn.execute("PRAGMA foreign_keys=ON")
conn.executescript("""
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL
);
""")
for file in ("0099_mobile_access_sessions.sql", "0100_mobile_refresh_sessions.sql"):
    conn.executescript((root / "drizzle" / file).read_text())

tables = {row[0] for row in conn.execute(
    "SELECT name FROM sqlite_master WHERE type='table'"
)}
required = {"accounts", "mobile_access_sessions", "mobile_refresh_sessions"}
assert required <= tables, f"Missing expected tables: {required - tables}"

for table in ("mobile_access_sessions", "mobile_refresh_sessions"):
    columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    assert {"token_hash", "account_id", "expires_at"} <= columns
    fk = list(conn.execute(f"PRAGMA foreign_key_list({table})"))
    assert any(row[2] == "accounts" and row[3] == "account_id" for row in fk)

conn.execute("INSERT INTO accounts(id,username) VALUES ('test-staff','stage-user')")
for table in ("mobile_access_sessions", "mobile_refresh_sessions"):
    conn.execute(f"INSERT INTO {table}(token_hash,account_id,expires_at) VALUES (?,?,?)",
                 ("hash-"+table, "test-staff", 9999999999999))
    assert conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 1
    try:
        conn.execute(f"INSERT INTO {table}(token_hash,account_id,expires_at) VALUES (?,?,?)",
                     ("invalid-"+table, "nonexistent", 9999999999999))
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError(f"Foreign key was not enforced in {table}")

conn.execute("DELETE FROM accounts WHERE id='test-staff'")
for table in ("mobile_access_sessions", "mobile_refresh_sessions"):
    assert conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0,         f"ON DELETE CASCADE failed in {table}"
print("PASS: mobile session DDL on in-memory SQLite (not Cloudflare staging)")
