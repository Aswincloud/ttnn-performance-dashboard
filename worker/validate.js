// Input validation for the subscribe endpoint. Kept dependency-free so it can
// run in the Worker runtime without bundling anything.

// Pragmatic email check: one @, a dot in the domain, no whitespace. We don't
// try to fully implement RFC 5322 — the double opt-in confirmation step is the
// real proof the address is valid and owned by the person subscribing.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_PCT = 1000; // a 1000% slowdown (11x) is already absurd; reject typos above this

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}

// Normalize a threshold field. Returns:
//   { ok: true, value: number|null }  — null means "not watching this direction"
//   { ok: false, error: string }
function normalizeThreshold(raw, label) {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, value: null };
  }
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    return { ok: false, error: `${label} must be a number` };
  }
  if (n <= 0) {
    return { ok: false, error: `${label} must be greater than 0` };
  }
  if (n > MAX_PCT) {
    return { ok: false, error: `${label} must be ${MAX_PCT} or less` };
  }
  // Round to two decimals to avoid storing float noise from the form.
  return { ok: true, value: Math.round(n * 100) / 100 };
}

// Validate and normalize a subscribe payload.
// Returns { ok: true, value: { email, improve_pct, degrade_pct } }
//      or { ok: false, error }
export function validateSubscription(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body' };
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) {
    return { ok: false, error: 'Enter a valid email address' };
  }

  const improve = normalizeThreshold(body.improve_pct, 'Improvement threshold');
  if (!improve.ok) return improve;

  const degrade = normalizeThreshold(body.degrade_pct, 'Degradation threshold');
  if (!degrade.ok) return degrade;

  if (improve.value === null && degrade.value === null) {
    return { ok: false, error: 'Set at least one threshold (improvement or degradation)' };
  }

  return {
    ok: true,
    value: { email, improve_pct: improve.value, degrade_pct: degrade.value },
  };
}

// Validate just the threshold pair (for admin threshold edits). Same rules as
// subscribe: each optional, but at least one must be set.
// Returns { ok: true, value: { improve_pct, degrade_pct } } or { ok: false, error }.
export function validateThresholds(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body' };
  }
  const improve = normalizeThreshold(body.improve_pct, 'Improvement threshold');
  if (!improve.ok) return improve;
  const degrade = normalizeThreshold(body.degrade_pct, 'Degradation threshold');
  if (!degrade.ok) return degrade;
  if (improve.value === null && degrade.value === null) {
    return { ok: false, error: 'Set at least one threshold (improvement or degradation)' };
  }
  return { ok: true, value: { improve_pct: improve.value, degrade_pct: degrade.value } };
}
