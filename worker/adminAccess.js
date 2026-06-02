// Access control for the admin subscriber view.
//
// Two independent factors gate the subscriber data (see worker/index.js):
//   1. The request comes from the operator's home IP — determined by resolving
//      ADMIN_HOSTNAME (a DNS-only DDNS record, e.g. ssh.aswincloud.com) and
//      comparing to the edge-set CF-Connecting-IP.
//   2. A secret ADMIN_KEY presented as a Bearer token.
//
// IP match alone only reveals the UI; it is NOT sufficient to read PII, because
// an ISP could reassign the operator's old IP (before DDNS updates) to a
// stranger, and anyone on the home LAN shares the IP. The key is the real gate.
// Everything here fails closed: any error → "not home" / "not authorized".

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

// Constant-time string comparison, to avoid leaking the key via response timing.
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Compare against a fixed-length derived value so length itself isn't a fast
  // reject path. XOR-accumulate over the longer of the two.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// Extract a Bearer token from the Authorization header, or null.
export function bearerToken(request) {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}
