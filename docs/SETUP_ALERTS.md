# Setup Guide — Performance Alert Subscriptions

This is the **operator** setup for the self-service alert system (Cloudflare
Worker + D1 + Resend). End users don't need any of this — they just click
**Get Alerts** on the dashboard. See [PERFORMANCE_ALERTS.md](PERFORMANCE_ALERTS.md)
for how the system works.

> This replaces the old GitHub-Actions email job. There are no GitHub secrets to
> configure for alerts anymore — everything lives on Cloudflare.

## Prerequisites

- The Worker is deployed (it serves the dashboard at the custom domain).
- A Resend account with the sender domain **verified** (e.g. `aswincloud.com`).
  The default `onboarding@resend.dev` only delivers to the Resend account owner.

## One-time setup

### 1. Create the D1 database

```bash
npx wrangler d1 create ttnn-alerts
```

Copy the printed `database_id` into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ttnn-alerts"
database_id = "<paste here>"
```

### 2. Apply the schema

```bash
npx wrangler d1 migrations apply ttnn-alerts --remote
```

Creates the `subscribers` and `meta` tables (`migrations/0001_init.sql`).

### 3. Set the secrets

```bash
npx wrangler secret put RESEND_API_KEY     # your Resend API key (starts with re_)
npx wrangler secret put FROM_EMAIL         # e.g. TTNN Alerts <alerts@aswincloud.com>
```

`SITE_URL` and the daily cron (`0 4 * * *`) are already in `wrangler.toml`; no
action needed.

### 4. Deploy

```bash
npm run build
npx wrangler deploy
```

The cron trigger registers automatically. That's it — the **Get Alerts** form is
live and the daily 04:00 UTC run will email confirmed subscribers.

## Verify it's working

```bash
# Subscribe yourself
curl -X POST https://ttnn-eltwise-performance.aswincloud.com/api/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@yourdomain.com","degrade_pct":5,"improve_pct":5}'
```

You should receive a confirmation email; click the link, and you're set to receive
alerts on the next run. To check the stored rows:

```bash
npx wrangler d1 execute ttnn-alerts --remote --command "SELECT email, confirmed FROM subscribers"
```

For full local testing (subscribe/confirm/unsubscribe + manually firing the cron),
see the **Local development & testing** section of
[PERFORMANCE_ALERTS.md](PERFORMANCE_ALERTS.md).

## Troubleshooting

| Symptom | Check |
|---------|-------|
| No confirmation email | `FROM_EMAIL` is a **verified** Resend domain; `RESEND_API_KEY` valid. Worker logs (`wrangler tail`) show the Resend error body. |
| Subscribed but no alerts | Address must be **confirmed**; and an op must actually cross the chosen threshold that day. |
| `D1_ERROR` / no such table | Run the migration: `wrangler d1 migrations apply ttnn-alerts --remote`. |
| Nothing fired after a data push | Cron is 04:00 UTC; data publishes ~02:00 UTC. Worst case is a one-day delay — the idempotency guard prevents double-sends. |

## Success checklist

- [ ] D1 `ttnn-alerts` created and `database_id` in `wrangler.toml`
- [ ] Migration applied (`subscribers` + `meta` tables exist)
- [ ] `RESEND_API_KEY` + `FROM_EMAIL` secrets set
- [ ] Sender domain verified in Resend
- [ ] `wrangler deploy` succeeded; cron trigger shows in the dashboard
- [ ] Test subscribe → confirmation email received → confirmed row in D1
