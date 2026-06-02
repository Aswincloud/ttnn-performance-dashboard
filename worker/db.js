// Thin D1 helpers for the subscribers + meta tables (see migrations/0001_init.sql).
// env.DB is the D1 binding declared in wrangler.toml.

// 128-bit URL-safe random token for confirm / unsubscribe links.
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

// Create a pending (unconfirmed) subscriber, or update the thresholds of an
// existing one. Returns { confirmToken, alreadyConfirmed }.
//
// Re-subscribing an existing CONFIRMED address just updates its thresholds in
// place (no new confirmation needed). Re-subscribing an unconfirmed address
// rotates its confirm token and re-sends confirmation.
export async function upsertSubscriber(db, { email, improve_pct, degrade_pct }) {
  const existing = await db
    .prepare('SELECT id, confirmed FROM subscribers WHERE email = ?')
    .bind(email)
    .first();

  const now = new Date().toISOString();

  if (existing && existing.confirmed === 1) {
    await db
      .prepare('UPDATE subscribers SET improve_pct = ?, degrade_pct = ? WHERE id = ?')
      .bind(improve_pct, degrade_pct, existing.id)
      .run();
    return { confirmToken: null, alreadyConfirmed: true };
  }

  const confirmToken = newToken();

  if (existing) {
    // Unconfirmed row exists — refresh thresholds + token, keep unsub_token.
    await db
      .prepare(
        'UPDATE subscribers SET improve_pct = ?, degrade_pct = ?, confirm_token = ?, created_at = ? WHERE id = ?'
      )
      .bind(improve_pct, degrade_pct, confirmToken, now, existing.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO subscribers (email, improve_pct, degrade_pct, confirmed, confirm_token, unsub_token, created_at)
         VALUES (?, ?, ?, 0, ?, ?, ?)`
      )
      .bind(email, improve_pct, degrade_pct, confirmToken, newToken(), now)
      .run();
  }

  return { confirmToken, alreadyConfirmed: false };
}

// Flip a pending subscriber to confirmed. Returns the subscriber row
// { email, improve_pct, degrade_pct, unsub_token } on success, or null if the
// token didn't match a pending row.
export async function confirmByToken(db, token) {
  if (!token) return null;
  const row = await db
    .prepare(
      'SELECT id, email, improve_pct, degrade_pct, unsub_token FROM subscribers WHERE confirm_token = ?'
    )
    .bind(token)
    .first();
  if (!row) return null;

  // Confirm conditionally on the token still being present, so a double-clicked
  // link can't confirm twice. Only the request whose UPDATE actually changed a
  // row "wins" — the loser sees changes === 0 and is treated as already-used.
  // This is what prevents duplicate "confirmed" admin notifications.
  const res = await db
    .prepare(
      'UPDATE subscribers SET confirmed = 1, confirm_token = NULL, confirmed_at = ? WHERE confirm_token = ?'
    )
    .bind(new Date().toISOString(), token)
    .run();
  if ((res.meta?.changes ?? 0) === 0) return null;
  return row;
}

// Delete a subscriber by unsubscribe token. Returns the deleted row
// { email, improve_pct, degrade_pct, confirmed } if one matched, else null.
export async function deleteByUnsubToken(db, token) {
  if (!token) return null;
  const row = await db
    .prepare(
      'SELECT email, improve_pct, degrade_pct, confirmed FROM subscribers WHERE unsub_token = ?'
    )
    .bind(token)
    .first();
  if (!row) return null;

  // Only the request whose DELETE actually removed the row "wins"; a concurrent
  // second call sees changes === 0 and returns null, so the "unsubscribed"
  // admin notification fires at most once.
  const res = await db
    .prepare('DELETE FROM subscribers WHERE unsub_token = ?')
    .bind(token)
    .run();
  if ((res.meta?.changes ?? 0) === 0) return null;
  return row;
}

// Count of confirmed subscribers (for the admin heads-up).
export async function countConfirmed(db) {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM subscribers WHERE confirmed = 1')
    .first();
  return row ? row.n : 0;
}

// All subscribers (confirmed + pending) for the read-only admin view. Excludes
// tokens — the admin view never needs them and they shouldn't leave the DB.
export async function listAllSubscribers(db) {
  const res = await db
    .prepare(
      `SELECT email, improve_pct, degrade_pct, confirmed, created_at, confirmed_at
       FROM subscribers
       ORDER BY confirmed DESC, created_at DESC`
    )
    .all();
  return res.results ?? [];
}

// All confirmed subscribers, for the daily alert run.
export async function listConfirmed(db) {
  const res = await db
    .prepare(
      'SELECT email, improve_pct, degrade_pct, unsub_token FROM subscribers WHERE confirmed = 1'
    )
    .all();
  return res.results ?? [];
}

export async function getMeta(db, key) {
  const row = await db.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

export async function setMeta(db, key, value) {
  await db
    .prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .bind(key, value)
    .run();
}
