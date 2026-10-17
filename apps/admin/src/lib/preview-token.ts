/**
 * Signed, short-lived page-preview tokens (ADMIN_B2-02).
 *
 * The admin signs { tenantId, pageId, exp } and links to the storefront's preview route
 * (`<storefront>/preview?token=...`), which verifies the token and renders that page's DRAFT
 * (pages.sections + pages.draft_meta) instead of the published version.
 *
 * Self-contained on purpose (node:crypto only, no app imports) so the storefront can share it:
 * move this file to packages/core (e.g. `@rentweb/core/preview-token`) or import the same logic there.
 * Key: HMAC-SHA256 under a key derived from SECRETS_ENCRYPTION_KEY (both apps load the root .env), with the
 * same deterministic dev fallback as @rentweb/core/crypto.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const PREVIEW_TOKEN_TTL_SECONDS = 30 * 60;
const PURPOSE = "rentweb:page-preview:v1";

export interface PreviewTokenPayload {
  /** tenant id */
  t: string;
  /** page id */
  p: string;
  /** expiry, unix seconds */
  e: number;
}

function signingKey(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") throw new Error("SECRETS_ENCRYPTION_KEY is required in production");
    return createHmac("sha256", createHash("sha256").update("rentweb-dev-only-key").digest()).update(PURPOSE).digest();
  }
  return createHmac("sha256", Buffer.from(raw, "base64")).update(PURPOSE).digest();
}

function mac(body: string): string {
  return createHmac("sha256", signingKey()).update(body).digest("base64url");
}

export function signPreviewToken(input: { tenantId: string; pageId: string; ttlSeconds?: number; now?: number }): string {
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  const payload: PreviewTokenPayload = { t: input.tenantId, p: input.pageId, e: now + (input.ttlSeconds ?? PREVIEW_TOKEN_TTL_SECONDS) };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body)}`;
}

export type PreviewTokenCheck = { ok: true; tenantId: string; pageId: string; expiresAt: Date } | { ok: false; reason: "malformed" | "bad-signature" | "expired" | "wrong-tenant" };

/** Verifies signature + expiry and (when given) that the token belongs to `expectedTenantId`. */
export function verifyPreviewToken(token: string | null | undefined, opts: { expectedTenantId?: string; now?: number } = {}): PreviewTokenCheck {
  if (!token || token.length > 512) return { ok: false, reason: "malformed" };
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return { ok: false, reason: "malformed" };
  const body = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(mac(body));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return { ok: false, reason: "bad-signature" };
  let payload: PreviewTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PreviewTokenPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof payload?.t !== "string" || typeof payload.p !== "string" || typeof payload.e !== "number") return { ok: false, reason: "malformed" };
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (payload.e <= now) return { ok: false, reason: "expired" };
  if (opts.expectedTenantId && payload.t !== opts.expectedTenantId) return { ok: false, reason: "wrong-tenant" };
  return { ok: true, tenantId: payload.t, pageId: payload.p, expiresAt: new Date(payload.e * 1000) };
}
