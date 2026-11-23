-- HAKI Strike stats: anonymous installs, daily activity, error counts, user reports. No wallets, keys, balances or trades.
CREATE TABLE IF NOT EXISTS installs (
  id TEXT PRIMARY KEY,          -- random install ID made by the extension
  first INTEGER NOT NULL,       -- ms
  last INTEGER NOT NULL,        -- ms
  ver TEXT, host TEXT, chain TEXT, os TEXT
);
CREATE TABLE IF NOT EXISTS active (
  day TEXT NOT NULL,            -- YYYY-MM-DD (UTC)
  id TEXT NOT NULL,
  ver TEXT, host TEXT,
  PRIMARY KEY (day, id)
);
CREATE TABLE IF NOT EXISTS errs (
  k TEXT PRIMARY KEY,           -- hash of kind + message
  kind TEXT, msg TEXT,
  n INTEGER NOT NULL DEFAULT 0, users INTEGER NOT NULL DEFAULT 0,
  vers TEXT, hosts TEXT,
  first INTEGER, last INTEGER
);
CREATE TABLE IF NOT EXISTS err_users (k TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (k, id));
CREATE TABLE IF NOT EXISTS quota (day TEXT NOT NULL, id TEXT NOT NULL, what TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, id, what));
CREATE TABLE IF NOT EXISTS reports (
  rid INTEGER PRIMARY KEY AUTOINCREMENT,
  t INTEGER NOT NULL, id TEXT, ver TEXT, host TEXT, chain TEXT,
  text TEXT, ctx TEXT,
  status TEXT NOT NULL DEFAULT 'open', note TEXT
);
CREATE INDEX IF NOT EXISTS active_day ON active(day);
CREATE INDEX IF NOT EXISTS reports_t ON reports(t);
-- subscription (2026-11-22)
CREATE TABLE IF NOT EXISTS lic (id TEXT PRIMARY KEY, created INTEGER, last INTEGER, ver TEXT, code INTEGER UNIQUE, fp TEXT, ip TEXT, wallets TEXT,
  trial_start INTEGER, trial_ok INTEGER, why TEXT, paid_until INTEGER NOT NULL DEFAULT 0, free INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS marks (kind TEXT NOT NULL, val TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (kind, val));
CREATE TABLE IF NOT EXISTS funders (w TEXT PRIMARY KEY, f TEXT);
CREATE TABLE IF NOT EXISTS pays (sig TEXT PRIMARY KEY, id TEXT, src TEXT, lamports INTEGER, days INTEGER, at INTEGER);
CREATE TABLE IF NOT EXISTS seen (sig TEXT PRIMARY KEY, at INTEGER);
CREATE TABLE IF NOT EXISTS conf (k TEXT PRIMARY KEY, v TEXT);
INSERT OR IGNORE INTO conf(k,v) VALUES('price','1'),('trial_days','7');
