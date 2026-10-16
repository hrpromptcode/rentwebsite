/**
 * Post-login redirect target. Only same-site relative paths are honoured: "//evil.example",
 * "/\evil.example", "https://evil.example", "javascript:" and anything that resolves to another
 * origin fall back to /account (open-redirect guard, SS-01 / SEC-005). Used by the login page and
 * re-checked inside verifyOtpAction, because bound server-action arguments come back from the client.
 */
export const DEFAULT_NEXT = "/account";

/** Backslash (treated as "/" by browsers) or control characters (stripped by URL parsers). */
function hasUnsafeChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x5c || c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

export function safeNext(next: unknown): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return DEFAULT_NEXT;
  // must be a single-slash absolute path; browsers treat "\" like "/" and strip tabs/newlines
  if (!next.startsWith("/") || next.startsWith("//") || hasUnsafeChar(next)) return DEFAULT_NEXT;
  try {
    const base = "http://same-site.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return DEFAULT_NEXT;
    return `${url.pathname}${url.search}${url.hash}` || DEFAULT_NEXT;
  } catch {
    return DEFAULT_NEXT;
  }
}
