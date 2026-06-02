// Daily alert engine. Ported from the old check_perf_changes.py: read the two
// newest measurements, compute per-operation % change, then for each confirmed
// subscriber send a tailored email containing only the ops that crossed their
// own improvement / degradation thresholds.

import { listConfirmed, getMeta, setMeta } from './db.js';
import { sendEmail, alertEmail } from './email.js';

const LAST_KEY = 'last_alert_key';

// Read a JSON asset (e.g. data/index.json) through the ASSETS binding.
async function readAsset(env, path) {
  // Asset paths are resolved relative to the deployed site origin; the URL host
  // is irrelevant for env.ASSETS.fetch but must be well-formed.
  const res = await env.ASSETS.fetch(new Request(`https://assets.local/${path}`));
  if (!res.ok) throw new Error(`asset ${path} → ${res.status}`);
  return res.json();
}

// Map operation_name → average_duration_ns for one measurement file.
function durationMap(fileData) {
  const map = new Map();
  for (const r of fileData.results || []) {
    if (r.operation_name && typeof r.average_duration_ns === 'number') {
      map.set(r.operation_name, r.average_duration_ns);
    }
  }
  return map;
}

// All operations whose change exceeds the largest single threshold anyone cares
// about — computed once, then filtered per subscriber. change_percent < 0 means
// faster (improvement); > 0 means slower (degradation). Same formula as
// check_perf_changes.py.
function computeChanges(latest, previous) {
  const latestMap = durationMap(latest);
  const prevMap = durationMap(previous);
  const changes = [];
  for (const [op, latestAvg] of latestMap) {
    const prevAvg = prevMap.get(op);
    if (prevAvg === undefined || prevAvg === 0) continue;
    const pct = ((latestAvg - prevAvg) / prevAvg) * 100;
    changes.push({
      operation_name: op,
      previous_avg_ns: prevAvg,
      latest_avg_ns: latestAvg,
      change_percent: pct,
      change_type: pct < 0 ? 'improvement' : 'regression',
    });
  }
  return changes;
}

// Which of the precomputed changes cross THIS subscriber's thresholds.
function opsForSubscriber(changes, sub) {
  const out = [];
  for (const c of changes) {
    if (c.change_type === 'improvement' && sub.improve_pct != null) {
      // improvement magnitude = how much faster, i.e. -change_percent
      if (-c.change_percent >= sub.improve_pct) out.push(c);
    } else if (c.change_type === 'regression' && sub.degrade_pct != null) {
      if (c.change_percent >= sub.degrade_pct) out.push(c);
    }
  }
  return out;
}

// Run the alert pass. Returns a small summary object for logging.
export async function runAlerts(env) {
  const index = await readAsset(env, 'data/index.json');
  const files = index.files || [];
  if (files.length < 2) {
    return { skipped: 'not enough measurements', files: files.length };
  }

  const latestMeta = files[0];
  const prevMeta = files[1];

  // Idempotency: don't re-alert on a measurement we've already processed.
  const key = `${latestMeta.measurement_date}|${latestMeta.git_commit_id}`;
  if ((await getMeta(env.DB, LAST_KEY)) === key) {
    return { skipped: 'already processed', key };
  }

  const [latest, previous] = await Promise.all([
    readAsset(env, latestMeta.path),
    readAsset(env, prevMeta.path),
  ]);

  const changes = computeChanges(latest, previous);
  const meta = {
    measurement_date: latestMeta.measurement_date,
    previous_date: prevMeta.measurement_date,
    git_commit_id: latestMeta.git_commit_id,
  };

  const subscribers = await listConfirmed(env.DB);
  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    const ops = opsForSubscriber(changes, sub);
    if (ops.length === 0) continue;

    const unsubscribeUrl = `${env.SITE_URL}/api/unsubscribe?token=${sub.unsub_token}`;
    const { subject, html } = alertEmail({
      siteUrl: env.SITE_URL,
      unsubscribeUrl,
      subscriber: sub,
      ops,
      meta,
    });

    const res = await sendEmail(env, { to: sub.email, subject, html });
    if (res.ok) sent += 1;
    else {
      failed += 1;
      console.error(`alert send failed for ${sub.email}: ${res.status} ${res.body}`);
    }
  }

  // Record the processed measurement only after attempting sends, so a total
  // failure (e.g. Resend outage) lets the next cron retry the same data.
  if (failed === 0) {
    await setMeta(env.DB, LAST_KEY, key);
  }

  return { key, subscribers: subscribers.length, changes: changes.length, sent, failed };
}
