/**
 * Request metadata for storefront customer auth (OTP rate limits, session records, cookie flags).
 *
 * X-Forwarded-For / X-Forwarded-Proto are plain request headers: without a reverse proxy that rewrites or
 * appends them, the client chooses their value (Next.js only fills them from the socket when the request has
 * none). So X-Forwarded-For is read only when TRUSTED_PROXY declares the proxies in front of the app.
 */

type HeaderLike = { get(name: string): string | null };

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HEX16 = /^[0-9a-f]{1,4}$/i;

function isIpv6(v: string): boolean {
  if (v.length < 2 || v.length > 45) return false;
  const halves = v.split("::");
  if (halves.length > 2) return false;
  const groups = halves.flatMap((h) => (h ? h.split(":") : []));
  let count = 0;
  for (const [i, g] of groups.entries()) {
    if (HEX16.test(g)) count += 1;
    else if (i === groups.length - 1 && IPV4.test(g)) count += 2; // ::ffff:1.2.3.4 style tail
    else return false;
  }
  return halves.length === 2 ? count <= 7 : count === 8;
}

/**
 * TRUSTED_PROXY = how many reverse-proxy hops in front of the app append the peer address to X-Forwarded-For
 * ("1" or "true": one proxy / platform edge such as nginx, Caddy, Vercel; "2": CDN + proxy; unset / "0" /
 * "false": none — X-Forwarded-For is ignored).
 */
export function trustedProxyHops(value: string | undefined = process.env.TRUSTED_PROXY): number {
  const v = (value ?? "").trim().toLowerCase();
  if (!v || ["0", "false", "no", "off", "none"].includes(v)) return 0;
  if (["true", "yes", "on"].includes(v)) return 1;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 10 ? n : 0;
}

/** A single IP literal (port / brackets / IPv4-mapped prefix removed), or null when it is not an IP at all. */
export function normalizeIp(raw: string | null | undefined): string | null {
  let v = (raw ?? "").trim();
  if (!v || v.length > 64) return null;
  if (v.startsWith("[")) {
    const end = v.indexOf("]");
    if (end < 0) return null;
    v = v.slice(1, end); // [v6]:port
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/.test(v)) v = v.slice(0, v.lastIndexOf(":")); // v4:port
  if (/^::ffff:\d{1,3}(\.\d{1,3}){3}$/i.test(v)) v = v.slice(7);
  if (IPV4.test(v)) return v;
  return isIpv6(v) ? v.toLowerCase() : null;
}

/**
 * Client IP: with TRUSTED_PROXY = n, the X-Forwarded-For entry n hops from the right (what the outermost trusted
 * proxy saw; anything further left was sent by the client). Otherwise — or when that entry is not an IP —
 * X-Real-IP (set by proxies that overwrite it), else null (per-IP limits are skipped; per-target limits still hold).
 */
export function clientIp(h: HeaderLike, hops: number = trustedProxyHops()): string | null {
  if (hops > 0) {
    const chain = (h.get("x-forwarded-for") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (chain.length) {
      const ip = normalizeIp(chain[Math.max(0, chain.length - hops)]);
      if (ip) return ip;
    }
  }
  return normalizeIp(h.get("x-real-ip"));
}

/**
 * Was the request made over HTTPS? X-Forwarded-Proto (first value — Next.js sets it from the socket when no proxy
 * did), else the scheme of the given URL (e.g. the Origin of a server-action POST). Never derived from the host name.
 */
export function isHttpsRequest(h: HeaderLike, url?: string | null): boolean {
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto) return proto === "https";
  if (url) {
    try {
      return new URL(url).protocol === "https:";
    } catch {
      /* not a URL */
    }
  }
  return false;
}
