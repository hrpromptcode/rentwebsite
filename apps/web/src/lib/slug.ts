/**
 * Dynamic route params can still be percent-encoded for non-ASCII (Thai) slugs after the host → /rw/{tenantId} rewrite.
 * Decode once and tolerate malformed input so a bad URL yields a 404 instead of a 500.
 */
export function decodeSlug(s: string): string {
  if (!s.includes("%")) return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
