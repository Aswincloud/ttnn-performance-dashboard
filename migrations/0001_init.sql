-- Subscribers to per-operation performance alerts.
--
-- improve_pct / degrade_pct are independent: a subscriber may watch only
-- improvements, only degradations, or both. NULL means "don't alert on that
-- direction". At least one must be set (enforced in worker/validate.js).
--
-- Double opt-in: rows are created with confirmed = 0 and only receive alerts
-- once the confirmation link flips confirmed = 1. Every alert email carries an
-- unsubscribe link keyed on unsub_token.
CREATE TABLE IF NOT EXISTS subscribers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  improve_pct   REAL,              -- alert when an op improves (gets faster) by >= this %
  degrade_pct   REAL,              -- alert when an op degrades (gets slower) by >= this %
  confirmed     INTEGER NOT NULL DEFAULT 0,
  confirm_token TEXT,              -- cleared once confirmed
  unsub_token   TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  confirmed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscribers_confirm_token ON subscribers (confirm_token);
CREATE INDEX IF NOT EXISTS idx_subscribers_unsub_token ON subscribers (unsub_token);

-- Small key/value store. Used for idempotency: last_alert_key records the
-- measurement we last sent alerts for so a re-run on the same data is a no-op.
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
