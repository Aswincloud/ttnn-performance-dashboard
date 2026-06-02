# Performance Change Alerts (self-service subscriptions)

Visitors can subscribe to email alerts for TTNN performance changes and choose
their own thresholds — separately for improvements and degradations. From the
next daily run onward, each confirmed subscriber gets a tailored email listing
only the operations that crossed *their* thresholds.

> Replaces the previous single-recipient GitHub Actions job
> (`check_perf_changes.py` at a fixed 20% threshold), which has been removed.

## How it works

```
Browser ──POST /api/subscribe──▶ Worker ──▶ D1 (row: confirmed = 0)
                                   └──▶ Resend "confirm your subscription" email
Click link ──GET /api/confirm?token─▶ Worker ──▶ D1 (confirmed = 1)

Cron (daily 04:00 UTC) ──▶ Worker.scheduled ──▶ read newest 2 data files (ASSETS)
                                             ──▶ compute per-op % change
                                             ──▶ for each confirmed subscriber:
                                                   ops crossing their %  ──▶ tailored Resend email
                                             ──▶ record processed measurement (idempotency)

Alert footer ──GET /api/unsubscribe?token─▶ Worker ──▶ D1 delete row
```

Everything runs on the existing Cloudflare Worker — no GitHub Actions involvement.
The Worker reads the performance JSON from its own bundled assets (the data files
baked into `dist/`), so the alert engine is self-contained.

### Double opt-in

The signup form is public, so a confirmation step is mandatory: a new row is
created `confirmed = 0` and receives **no** alerts until the confirmation link is
clicked. Every alert email carries a one-click unsubscribe link.

### Idempotency

Each run records `last_alert_key = "<measurement_date>|<git_commit_id>"` in the
`meta` table, but only after all sends for that measurement succeed. A re-run on
the same data is a no-op; a failed send (e.g. Resend outage) leaves the key unset
so the next cron retries.

## Components

| Piece | File | Role |
|-------|------|------|
| Worker entry | `worker/index.js` | Routes `/api/*`, serves the SPA, runs the cron |
| Alert engine | `worker/alerts.js` | Compares the two newest measurements, matches per-subscriber thresholds |
| Email | `worker/email.js` | Resend send + confirmation / alert HTML |
| D1 helpers | `worker/db.js` | Subscriber upsert / confirm / unsubscribe / list |
| Validation | `worker/validate.js` | Email + threshold checks |
| Schema | `migrations/0001_init.sql` | `subscribers` + `meta` tables |
| UI | `src/components/SubscribeModal.jsx` | The "Get Alerts" signup form |

## Configuration

Cloudflare **secrets** (set with `npx wrangler secret put <NAME>`):

| Secret | Description |
|--------|-------------|
| `RESEND_API_KEY` | Resend API key |
| `FROM_EMAIL` | Verified sender, e.g. `TTNN Alerts <alerts@aswincloud.com>` |

Cloudflare **vars / bindings** (in `wrangler.toml`):

| Name | Description |
|------|-------------|
| `SITE_URL` | Base URL used to build confirm / unsubscribe links |
| `DB` | D1 database binding (`ttnn-alerts`) |
| `ASSETS` | Assets binding (lets the cron read the data files) |
| `crons` | `["0 4 * * *"]` — daily alert run |

> `FROM_EMAIL` must be a **Resend-verified domain**. The default
> `onboarding@resend.dev` can only deliver to the Resend account owner, so
> confirmation mail to other recipients would silently fail.

## One-time setup

```bash
npx wrangler d1 create ttnn-alerts                       # paste database_id into wrangler.toml
npx wrangler d1 migrations apply ttnn-alerts --remote    # create the tables
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put FROM_EMAIL
```

## Local development & testing

`npm run dev` (Vite :3000) serves the SPA but **cannot** exercise `/api/*` — those
routes only exist in the Worker. Use Wrangler:

```bash
npm run build
npx wrangler d1 migrations apply ttnn-alerts --local     # one-time, sets up local D1
npx wrangler dev --local                                 # serves dist/ + Worker + local D1
```

Then:

```bash
# Subscribe (creates an unconfirmed row + tries to send a confirmation email)
curl -X POST localhost:8787/api/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","degrade_pct":10,"improve_pct":10}'

# Inspect the row (grab confirm_token / unsub_token)
npx wrangler d1 execute ttnn-alerts --local --command "SELECT * FROM subscribers"

# Confirm, then unsubscribe
curl "localhost:8787/api/confirm?token=<confirm_token>"
curl "localhost:8787/api/unsubscribe?token=<unsub_token>"

# Manually fire the daily run (cron isn't auto-triggered locally)
curl "localhost:8787/cdn-cgi/handler/scheduled"
```

Point `RESEND_API_KEY` at a real key and subscribe with an address you own to see
actual confirmation / alert mail.

## Troubleshooting

- **No confirmation email** — check `RESEND_API_KEY` and that `FROM_EMAIL` is a
  verified Resend domain. Worker logs show the Resend error body.
- **Subscribed but no alerts** — the address must be **confirmed** (click the link);
  unconfirmed rows are skipped. Also check that some op actually crossed the
  chosen threshold that day.
- **"Not enough measurements"** — the engine needs ≥ 2 files in `data/index.json`.
- **Alerts didn't fire after a data push** — the cron runs at 04:00 UTC; data is
  published ~02:00 UTC. A late deploy delays alerts by at most a day (idempotency
  guard prevents a double-send once it does run).

## Security notes

- Secrets live in Cloudflare (never in code or the repo).
- Double opt-in + per-email unsubscribe token; an attacker can't subscribe a
  victim to ongoing mail (only a single ignorable confirmation).
- Email content is performance metrics only.
- HTTPS to Resend.

## Possible follow-ups

- Cloudflare Turnstile on the signup form (bot/spam hardening).
- Per-operation or per-category subscriptions (not just a global threshold).
- A "manage my subscription" page keyed on the unsubscribe token.
