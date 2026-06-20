# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.** Public issues
disclose the vulnerability before it can be fixed.

Instead, report privately through either channel:

1. **GitHub private vulnerability reporting** (preferred) — on the repository's
   **Security** tab, click **Report a vulnerability**. This keeps the discussion
   private and tracked.
   _(Maintainer: enable this under Settings → Security → "Private vulnerability
   reporting" if the button isn't visible yet.)_
2. **Email** — `security@aswincloud.com`. Include "SECURITY" in the subject.

Please include enough detail to reproduce:

- what the issue is and the impact you see,
- steps or a proof of concept,
- affected URL/endpoint or file/line,
- any relevant logs (with secrets redacted).

## What to expect

This is a small, single-maintainer project, so timelines are best-effort:

- **Acknowledgement:** within ~5 days.
- **Assessment & fix plan:** communicated after triage.
- **Disclosure:** coordinated — please give a reasonable window to ship a fix
  before any public write-up.

## Scope

This project is a static dashboard plus a Cloudflare Worker for email-alert
subscriptions. The most relevant areas:

- **Worker API** (`worker/`) — the `/api/subscribe`, `/api/confirm`,
  `/api/unsubscribe`, and `/api/admin/*` endpoints.
- **Subscriber data** in D1 and the double opt-in / unsubscribe token flow.
- **The deployed site** at the production URL.

Out of scope: the upstream Tenstorrent TT-Metal framework itself, third-party
services (Cloudflare, Resend, GitHub), and the published performance JSON (it is
public measurement data by design).

## Handling of secrets

API tokens, the Resend key, and admin credentials are stored only as Cloudflare
Worker secrets / local `.dev.vars` (gitignored) — never committed. If you find a
secret committed to the repo or exposed in logs, **treat it as a vulnerability
and report it privately** so it can be rotated.
