# Reusable "home IP" policy via a Cloudflare IP List

A single account-level **IP List** (`home`) that tracks your dynamic home IP, so
**any** application behind Cloudflare can gate on "is this request from home?"
by referencing the list — no per-app code.

This complements (doesn't replace) the dashboard Worker's existing `isAtHome`
DoH check; both can coexist.

## Pieces

| Piece | What | Where |
|-------|------|-------|
| `home` IP List | account-level list holding the current home IP | Cloudflare dashboard / API |
| `update-home-ip-list.sh` | DDNS-style updater that keeps the list current | this repo, runs on a home host via cron |
| WAF custom rule | gates admin paths unless `ip.src in $home` | per-zone, dashboard |

## One-time setup

### 1. Create the IP List
Dashboard → **Manage Account → Configurations → Lists → Create list**
- Name: `home`
- Content type: **IP**

(Or via API with a token that has **Account Filter Lists: Edit** — the read-only
session token can't create it.) Note the **list_id**.

### 2. Token for the updater
Create an API token scoped to **Account → Account Filter Lists: Edit** (only that).
Keep it on the home host, not in the repo.

### 3. Run the updater on a home machine
```bash
CF_API_TOKEN=<edit-lists-token> \
CF_ACCOUNT_ID=e38978124c8fdb38dc80c04cda318ab3 \
CF_LIST_ID=<home-list-id> \
scripts/update-home-ip-list.sh
```
It reads the host's current public IP (Cloudflare trace by default; or
`IP_SOURCE=ddns:ssh.aswincloud.com` to mirror your existing DDNS record),
compares to the list, and replaces the list item only when it changed.

Cron every 5 minutes:
```cron
*/5 * * * * CF_API_TOKEN=... CF_ACCOUNT_ID=... CF_LIST_ID=... /path/to/scripts/update-home-ip-list.sh >> ~/home-ip.log 2>&1
```

### 4. Gate admin paths with a WAF rule (per zone)
Dashboard → your zone → **Security → WAF → Custom rules → Create rule**
- Expression:
  ```
  (http.request.uri.path contains "/api/admin" and not ip.src in $home)
  ```
- Action: **Block**

Now any request to `/api/admin/*` from outside the `home` list is blocked at the
edge, before it reaches the Worker. To reuse for another app, add a rule
referencing the same `$home` list on that app's zone — that's the "use it
anywhere" part.

## Reusing across applications
The `home` list is account-level. Any zone's WAF rule, or a Cloudflare Access
policy (IP ranges / list selector with a Bypass action), can reference it. One
list, kept current by one updater, gates as many apps as you like.

## Caveat (specific to this setup)
The home connection and the dashboard server currently share the same public IP
(`120.56.209.165`). Any IP-based policy authorizes that whole IP — i.e. other
devices on the home LAN too. The list/WAF approach is cleaner and reusable but
does not change *who* is authorized versus the existing in-Worker check; the
admin write-password remains the factor that narrows access to a single person.
