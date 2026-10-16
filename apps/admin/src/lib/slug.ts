/**
 * Client-side slug helpers for slug inputs (onboarding subdomain, page slug…).
 * While typing we must NOT trim a trailing hyphen, otherwise "my-shop" can never be typed
 * ("my-" → "my" on the keystroke). Trim only when the value is final: on blur / submit /
 * when the slug is derived from another field. Servers normalise again (core tenantSlug etc.).
 */
const MAX = 40;

/** Normalisation while the user is typing: lower-case, invalid chars → "-", no doubled or leading "-". */
export function typingSlug(input: string, max = MAX): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .slice(0, max);
}

/** Final form: typingSlug + no trailing "-". Use on blur, on submit and for slugs derived from a name. */
export function finalizeSlug(input: string, max = MAX): string {
  return typingSlug(input.trim(), max).replace(/-+$/, "");
}
