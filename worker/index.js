// Worker entry. Serves the static dashboard for everything except /api/*,
// which it handles itself. Also runs the daily alert cron via `scheduled`.

import { validateSubscription } from './validate.js';
import {
  upsertSubscriber,
  confirmByToken,
  deleteByUnsubToken,
  countConfirmed,
  listAllSubscribers,
} from './db.js';
import { sendEmail, confirmationEmail, adminNotificationEmail } from './email.js';
import { runAlerts } from './alerts.js';
import { isAtHome } from './adminAccess.js';

// Fire-and-forget admin heads-up for a confirm / unsubscribe. Best-effort: a
// failure here must never break the user-facing confirm/unsubscribe response,
// so we swallow errors (logged) rather than propagate them.
async function notifyAdmin(env, event, subscriber) {
  const to = env.ADMIN_EMAIL;
  if (!to) return; // not configured — skip silently
  try {
    const totalConfirmed = await countConfirmed(env.DB);
    const { subject, html } = adminNotificationEmail({
      siteUrl: env.SITE_URL,
      event,
      subscriber,
      totalConfirmed,
    });
    const res = await sendEmail(env, { to, subject, html });
    if (!res.ok) console.error(`admin notify (${event}) failed: ${res.status} ${res.body}`);
  } catch (err) {
    console.error(`admin notify (${event}) error:`, err && err.stack ? err.stack : err);
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Minimal HTML page for the confirm / unsubscribe link landings.
const htmlPage = (title, message, siteUrl) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${title}</title>
     <style>body{font-family:system-ui,Arial,sans-serif;background:#f1f5f9;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
     .card{background:#fff;padding:32px 40px;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.1);max-width:420px;text-align:center}
     a{color:#2563eb}</style></head>
     <body><div class="card"><h2>${title}</h2><p>${message}</p>
     <p><a href="${siteUrl}">← Back to the dashboard</a></p></div></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );

async function handleSubscribe(request, env, ctx) {
  // Per-IP rate limit (5 / 60s). CF-Connecting-IP is set at the edge and is not
  // spoofable. Applied before any DB work so a flood can't write rows either.
  if (env.SUBSCRIBE_LIMITER) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.SUBSCRIBE_LIMITER.limit({ key: ip });
    if (!success) {
      return json({ error: 'Too many requests. Please try again in a minute.' }, 429);
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const v = validateSubscription(body);
  if (!v.ok) return json({ error: v.error }, 400);

  const { confirmToken, alreadyConfirmed } = await upsertSubscriber(env.DB, v.value);

  if (alreadyConfirmed) {
    // Address already confirmed — thresholds were updated in place. No email
    // (revealing nothing about whether an address is subscribed avoids leaking
    // membership; the user sees a generic success either way).
    return json({ ok: true, message: 'Your alert preferences have been updated.' });
  }

  const confirmUrl = `${env.SITE_URL}/api/confirm?token=${confirmToken}`;
  const { subject, html } = confirmationEmail({
    siteUrl: env.SITE_URL,
    confirmUrl,
    improve_pct: v.value.improve_pct,
    degrade_pct: v.value.degrade_pct,
  });

  const res = await sendEmail(env, { to: v.value.email, subject, html });
  if (!res.ok) {
    console.error(`confirmation send failed: ${res.status} ${res.body}`);
    return json({ error: 'Could not send confirmation email. Try again later.' }, 502);
  }

  // Heads-up to the admin that a signup was started but not yet confirmed.
  // Gated behind the rate limit above, so a single IP can trigger at most
  // 5 of these per minute. Best-effort, non-blocking.
  ctx.waitUntil(notifyAdmin(env, 'pending', v.value));

  return json({ ok: true, message: 'Check your email to confirm your subscription.' });
}

async function handleConfirm(url, env, ctx) {
  const token = url.searchParams.get('token');
  const subscriber = await confirmByToken(env.DB, token);
  if (!subscriber) {
    return htmlPage(
      'Link expired',
      'This confirmation link is invalid or already used. Try subscribing again.',
      env.SITE_URL
    );
  }
  // Heads-up to the admin — only on a real confirmation (token-backed).
  ctx.waitUntil(notifyAdmin(env, 'confirmed', subscriber));
  return htmlPage(
    'Subscription confirmed ✅',
    'You will now receive TTNN performance alerts when an operation crosses your thresholds.',
    env.SITE_URL
  );
}

async function handleUnsubscribe(url, env, ctx) {
  const token = url.searchParams.get('token');
  const removed = await deleteByUnsubToken(env.DB, token);
  if (removed) {
    ctx.waitUntil(notifyAdmin(env, 'unsubscribed', removed));
  }
  return htmlPage(
    removed ? 'Unsubscribed' : 'Already unsubscribed',
    removed
      ? 'You have been removed and will no longer receive alerts.'
      : 'This link is invalid or you were already unsubscribed.',
    env.SITE_URL
  );
}

// Cheap "should the admin UI show?" probe. Leaks only a boolean — no PII, no
// auth needed. The data endpoint below is what's actually protected.
async function handleAdminContext(request, env) {
  const atHome = await isAtHome(env, request);
  return json({ atHome });
}

// Read-only subscriber list. Gated by the home-IP check (the operator's home
// network, tracked by ADMIN_HOSTNAME's DDNS). Fails closed on any resolve error.
async function handleAdminSubscribers(request, env) {
  if (!(await isAtHome(env, request))) {
    return json({ error: 'Forbidden' }, 403);
  }

  const subscribers = await listAllSubscribers(env.DB);
  const confirmed = subscribers.filter((s) => s.confirmed === 1).length;
  return json({
    subscribers,
    total: subscribers.length,
    confirmed,
    pending: subscribers.length - confirmed,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/api/subscribe' && request.method === 'POST') {
      return handleSubscribe(request, env, ctx);
    }
    if (pathname === '/api/admin/context' && request.method === 'GET') {
      return handleAdminContext(request, env);
    }
    if (pathname === '/api/admin/subscribers' && request.method === 'GET') {
      return handleAdminSubscribers(request, env);
    }
    if (pathname === '/api/confirm' && request.method === 'GET') {
      return handleConfirm(url, env, ctx);
    }
    if (pathname === '/api/unsubscribe' && request.method === 'GET') {
      return handleUnsubscribe(url, env, ctx);
    }
    if (pathname.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404);
    }

    // Everything else: serve the static dashboard (SPA + data files).
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runAlerts(env)
        .then((summary) => console.log('alert run:', JSON.stringify(summary)))
        .catch((err) => console.error('alert run failed:', err && err.stack ? err.stack : err))
    );
  },
};
