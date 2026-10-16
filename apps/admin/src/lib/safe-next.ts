/**
 * Post-login / post-logout return paths (`?next=`) must stay on this origin.
 * Shared by the login page (server redirect), the login form (client push), /logout and
 * requireSession — one rule everywhere (SEC-003).
 *
 * Accepts only an absolute path ("/t/shop/dashboard?x=1#y"). Rejects:
 *  - anything not starting with a single "/" ("https://evil", "evil", "")
 *  - protocol-relative and backslash tricks ("//evil", "/\evil", "\\evil") — browsers treat "\" as "/"
 *  - control characters (browsers strip TAB/CR/LF, so "/\t/evil" would become "//evil")
 *  - anything that resolves to another origin.
 * Safe to import from client components (no server-only deps).
 */
const BASE = "http://rentweb-next.invalid";

export function safeNext(next: unknown, fallback = "/"): string {
  return sanitizeNext(next) ?? fallback;
}

/** The normalised same-origin path, or null when `next` is missing or unsafe. */
export function sanitizeNext(next: unknown): string | null {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  if (next.includes("\\")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(next)) return null;
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  const out = url.pathname + url.search + url.hash;
  return out.startsWith("//") ? null : out;
}
