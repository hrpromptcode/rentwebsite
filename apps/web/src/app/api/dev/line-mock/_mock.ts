import "server-only";
import { decryptFromString, encryptToString } from "@rentweb/core/crypto";

/**
 * Dev-only LINE Login mock (NODE_ENV !== production && LINE_MOCK=1). Point the storefront at it with
 *   LINE_OAUTH_BASE=http://localhost:3000/api/dev/line-mock
 *   LINE_API_BASE=http://localhost:3000/api/dev/line-mock
 * and it serves the same paths LINE does: /oauth2/v2.1/authorize, /oauth2/v2.1/token, /oauth2/v2.1/verify,
 * /v2/profile. Codes and access tokens are stateless (sealed JSON) so the mock works across dev-server workers;
 * id_tokens are HS256-signed with whatever client_secret the token request sent, exactly like LINE, so the
 * storefront's real verification path runs unchanged.
 */

export interface MockUser {
  userId: string;
  displayName: string;
  email: string;
  /** short label for the picker */
  note: string;
}

export const MOCK_USERS: MockUser[] = [
  { userId: "Umock00000000000000000000000000a1", displayName: "สมชาย ใจดี", email: "somchai@example.com", note: "ลูกค้าใหม่ทั่วไป" },
  { userId: "Umock00000000000000000000000000b2", displayName: "สมหญิง รักสวย", email: "somying@example.com", note: "ใช้เชื่อมต่อกับบัญชี OTP เดิม" },
  { userId: "Umock00000000000000000000000000c3", displayName: "Mock Tester", email: "tester@example.com", note: "ชื่อภาษาอังกฤษ" },
];

export function mockEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.LINE_MOCK === "1";
}

export function pictureUrl(origin: string, userId: string): string {
  return `${origin}/api/dev/line-mock/picture/${encodeURIComponent(userId)}`;
}

export function findUser(userId: string | null | undefined): MockUser | undefined {
  return MOCK_USERS.find((u) => u.userId === userId);
}

/** Sealed, expiring JSON blob (authorization code / access token). */
export function seal(obj: Record<string, unknown>, ttlSec: number): string {
  return encryptToString(JSON.stringify({ ...obj, exp: Date.now() + ttlSec * 1000 }));
}

export function open<T extends Record<string, unknown>>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(decryptFromString(raw)) as T & { exp?: number };
    if (typeof obj.exp !== "number" || obj.exp < Date.now()) return null;
    return obj;
  } catch {
    return null;
  }
}

export function oauthError(error: string, description: string, status = 400): Response {
  return Response.json({ error, error_description: description }, { status, headers: { "cache-control": "no-store" } });
}

export const notFound = () => new Response("Not found", { status: 404 });
