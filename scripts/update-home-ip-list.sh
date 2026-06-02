#!/usr/bin/env bash
#
# Keep a Cloudflare account-level IP List in sync with this host's current
# public IP — a DDNS-style updater for the "home" List that WAF rules (and
# anything else) can reference as $home.
#
# Why: the home connection's public IP is dynamic. Cloudflare Lists are an
# account-level primitive reusable across WAF rules, Access policies, and zones,
# so a single self-updating "home" List lets any application gate on "is this
# request from home?" without per-app code.
#
# It replaces ALL items in the List with the single current IP (PUT semantics),
# so a stale previous IP is never left authorized.
#
# Setup (one-time):
#   1. Create the List in the Cloudflare dashboard (or via API with a token that
#      has "Account Filter Lists: Edit"):
#        Account Home > Manage Account > Configurations > Lists > Create
#        Name: home   Type: IP
#   2. Get its list_id (dashboard URL, or GET .../rules/lists).
#   3. Create an API token with "Account Filter Lists: Edit" on this account.
#   4. Export the env vars below and run, or add to cron (e.g. every 5 min):
#        */5 * * * * CF_API_TOKEN=... CF_ACCOUNT_ID=... CF_LIST_ID=... \
#          /path/to/update-home-ip-list.sh >> /var/log/home-ip.log 2>&1
#
# Required env:
#   CF_API_TOKEN   — token with Account Filter Lists: Edit
#   CF_ACCOUNT_ID  — Cloudflare account id
#   CF_LIST_ID     — the "home" List's id
# Optional:
#   IP_SOURCE      — how to determine the public IP:
#                      "trace"  (default) ask Cloudflare's own edge
#                      "ddns:<hostname>"  resolve a DDNS hostname instead
#                        (e.g. IP_SOURCE=ddns:ssh.aswincloud.com)

set -euo pipefail

: "${CF_API_TOKEN:?set CF_API_TOKEN (Account Filter Lists: Edit)}"
: "${CF_ACCOUNT_ID:?set CF_ACCOUNT_ID}"
: "${CF_LIST_ID:?set CF_LIST_ID}"
IP_SOURCE="${IP_SOURCE:-trace}"

api="https://api.cloudflare.com/client/v4"
auth=(-H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json")

# --- determine current public IPv4 ---
current_ip() {
  case "$IP_SOURCE" in
    trace)
      # Cloudflare's trace endpoint reports the IP it sees us as — authoritative
      # for "what IP will requests arrive from".
      curl -fsS https://1.1.1.1/cdn-cgi/trace | sed -n 's/^ip=//p'
      ;;
    ddns:*)
      local host="${IP_SOURCE#ddns:}"
      # DoH so we don't depend on local resolver config; take the final A record.
      curl -fsS -H 'accept: application/dns-json' \
        "https://1.1.1.1/dns-query?name=${host}&type=A" \
        | python3 -c 'import json,sys; a=[x["data"] for x in json.load(sys.stdin).get("Answer",[]) if x.get("type")==1]; print(a[-1] if a else "")'
      ;;
    *)
      echo "unknown IP_SOURCE: $IP_SOURCE" >&2; return 1 ;;
  esac
}

ip="$(current_ip)"
if [[ ! "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
  echo "$(date -u +%FT%TZ) ERROR: could not determine a valid IPv4 (got '${ip}')" >&2
  exit 1
fi

# --- read the List's current single item; skip the write if unchanged ---
existing="$(curl -fsS "${auth[@]}" "${api}/accounts/${CF_ACCOUNT_ID}/rules/lists/${CF_LIST_ID}/items" \
  | python3 -c 'import json,sys; r=json.load(sys.stdin).get("result") or []; print(r[0]["ip"] if r and "ip" in r[0] else "")' 2>/dev/null || echo "")"

if [[ "$existing" == "$ip" ]]; then
  echo "$(date -u +%FT%TZ) unchanged: ${ip}"
  exit 0
fi

# --- replace all items with the current IP (PUT = full replace) ---
resp="$(curl -fsS -X PUT "${auth[@]}" \
  "${api}/accounts/${CF_ACCOUNT_ID}/rules/lists/${CF_LIST_ID}/items" \
  --data "[{\"ip\":\"${ip}\",\"comment\":\"home (auto-updated $(date -u +%FT%TZ))\"}]")"

if echo "$resp" | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("success") else 1)'; then
  echo "$(date -u +%FT%TZ) updated: ${existing:-<empty>} -> ${ip}"
else
  echo "$(date -u +%FT%TZ) ERROR updating list: $resp" >&2
  exit 1
fi
