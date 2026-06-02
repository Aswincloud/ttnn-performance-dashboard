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

// Flip a pending subscriber to confirmed. Returns the row's unsub_token on
// success, or null if the token didn't match a pending row.
export async function confirmByToken(db, token) {
  if (!token) return null;
  const row = await db
    .prepare('SELECT id, unsub_token FROM subscribers WHERE confirm_token = ?')
    .bind(token)
    .first();
  if (!row) return null;

  await db
    .prepare(
      'UPDATE subscribers SET confirmed = 1, confirm_token = NULL, confirmed_at = ? WHERE id = ?'
    )
    .bind(new Date().toISOString(), row.id)
    .run();
  return row.unsub_token;
}

// Delete a subscriber by unsubscribe token. Returns true if a row was removed.
export async function deleteByUnsubToken(db, token) {
  if (!token) return false;
  const res = await db
    .prepare('DELETE FROM subscribers WHERE unsub_token = ?')
    .bind(token)
    .run();
  return (res.meta?.changes ?? 0) > 0;
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
