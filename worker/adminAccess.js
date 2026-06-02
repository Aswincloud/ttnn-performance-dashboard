// Access control for the admin subscriber view.
//
// The subscriber data is gated on the request coming from the operator's home
// network — determined by resolving ADMIN_HOSTNAME (a DNS-only DDNS record, e.g.
// ssh.aswincloud.com) via DNS-over-HTTPS and comparing to the edge-set
// CF-Connecting-IP. Fails closed: any resolve error → "not home".
//
// Note: this trusts everyone/everything sharing the home public IP (other LAN
// devices, and briefly a stranger if the ISP reassigns the IP before DDNS
// updates). Acceptable for this single-operator home setup; if that changes,
// re-add a secret-key second factor.

// Cache the resolved home IPs briefly so we don't issue a DoH lookup on every
// request. Module scope persists across requests on a warm isolate.
let _cache = { host: null, ips: null, at: 0 };
const CACHE_MS = 60_000;

// Resolve a hostname to its IPv4 address(es) via DNS-over-HTTPS, following the
// CNAME chain. DDNS records are typically CNAME → provider host → A, so we
// collect every type:1 (A) record in Answer[] rather than reading one — a host
// can have multiple A records and resolvers rotate their order, so we must
// match against the full set, not a single "last" entry.
// Returns an array of IPv4 strings (possibly empty); empty on any failure.
export async function resolveHostIps(hostname) {
  if (!hostname) return [];
  try {
    const url = `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`;
    const res = await fetch(url, { headers: { accept: 'application/dns-json' } });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.Status !== 0 || !Array.isArray(data.Answer)) return [];
    return data.Answer.filter((a) => a.type === 1 && a.data).map((a) => a.data);
  } catch {
    return [];
  }
}

// Is this request coming from the operator's home IP? True when the visitor's
// CF-Connecting-IP is among the host's resolved A records. Fails closed.
export async function isAtHome(env, request) {
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (!clientIp || !env.ADMIN_HOSTNAME) return false;

  const now = Date.now();
  let ips;
  if (_cache.host === env.ADMIN_HOSTNAME && now - _cache.at < CACHE_MS) {
    ips = _cache.ips;
  } else {
    ips = await resolveHostIps(env.ADMIN_HOSTNAME);
    _cache = { host: env.ADMIN_HOSTNAME, ips, at: now };
  }

  return Array.isArray(ips) && ips.includes(clientIp);
}

// SHA-256 of a string as lowercase hex.
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time hex-string compare (both inputs are fixed-length 64-char hex).
function timingSafeHexEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Verify a submitted password against the stored SHA-256 hash (env secret).
// Only the hash is ever stored — the plaintext lives nowhere at rest. Fails
// closed: if the hash secret isn't configured, no password is accepted.
export async function verifyPassword(env, provided) {
  if (!env.ADMIN_PASSWORD_HASH || typeof provided !== 'string' || provided === '') {
    return false;
  }
  const hash = await sha256Hex(provided);
  return timingSafeHexEqual(hash, env.ADMIN_PASSWORD_HASH.toLowerCase());
}
