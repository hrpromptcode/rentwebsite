import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@rentweb/db/test-utils";
import { customers, tenants, withTenant, type Tx } from "@rentweb/db";
import { eq } from "drizzle-orm";
import {
  LINE_ID_TOKEN_ISSUER,
  LINE_LOGIN_ERROR_MESSAGES,
  LINE_LOGIN_SECRET_KEYS,
  LINE_OAUTH_TTL_SEC,
  LineLoginError,
  buildLineAuthorizeUrl,
  clearLineLoginCredentials,
  createLineOauthTicket,
  createPkce,
  exchangeLineCode,
  getCustomerByToken,
  getLineLoginCredentials,
  getLineLoginStatus,
  isLineLoginEnabled,
  isLineLoginErrorCode,
  lineChannelIdError,
  lineChannelSecretError,
  lineCredentialWarnings,
  lineEndpoints,
  openLineOauthTicket,
  pkceChallenge,
  randomState,
  readTenantSecret,
  requestOtp,
  resolveLineIdentity,
  saveLineLoginCredentials,
  sealLineOauthTicket,
  signHs256Jwt,
  signInWithLine,
  unlinkLine,
  verifyLineIdToken,
  verifyOtp,
  writeTenantSecret,
  type LineIdentity,
} from "../src/customer";

const CHANNEL_ID = "1234567890";
const SECRET = "0123456789abcdef0123456789abcdef";
const nowSec = () => Math.floor(Date.now() / 1000);

function idToken(over: Record<string, unknown> = {}, secret = SECRET, header: Record<string, unknown> = {}) {
  return signHs256Jwt({ iss: LINE_ID_TOKEN_ISSUER, sub: "U0000000000000000000000000000001", aud: CHANNEL_ID, exp: nowSec() + 3600, iat: nowSec(), nonce: "n1", name: "สมชาย ใจดี", picture: "https://profile.line-scdn.net/abc", email: "somchai@example.com", ...over }, secret, header);
}

type FetchCall = { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } };
function fakeFetch(routes: Record<string, (call: FetchCall) => { status: number; body: unknown }>) {
  const calls: FetchCall[] = [];
  const impl = async (url: string, init?: FetchCall["init"]) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    if (!key) return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
    const r = routes[key]!({ url, init });
    return { ok: r.status < 400, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  return { impl, calls };
}

afterEach(() => {
  delete process.env.LINE_OAUTH_BASE;
  delete process.env.LINE_API_BASE;
});

/* ------------------------------------------------------------------ */
describe("PKCE / state / ticket cookie", () => {
  it("S256 challenge matches the RFC 7636 test vector", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("createPkce yields an unguessable verifier within the allowed length and a matching challenge", () => {
    const a = createPkce();
    const b = createPkce();
    expect(a.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeChallenge).toBe(pkceChallenge(a.codeVerifier));
  });
  it("randomState is url-safe and unique", () => {
    const s = new Set(Array.from({ length: 50 }, randomState));
    expect(s.size).toBe(50);
    for (const v of s) expect(v).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });
  it("ticket seals and opens, rejects tampering and expiry", () => {
    const t = createLineOauthTicket({ next: "/checkout", mode: "login" });
    const sealed = sealLineOauthTicket(t);
    expect(sealed).not.toContain(t.state);
    expect(openLineOauthTicket(sealed)).toEqual(t);
    expect(openLineOauthTicket(sealed.slice(0, -2) + "zz")).toBeNull();
    expect(openLineOauthTicket("v1.garbage")).toBeNull();
    expect(openLineOauthTicket(undefined)).toBeNull();
    expect(openLineOauthTicket(sealed, t.iat + (LINE_OAUTH_TTL_SEC + 1) * 1000)).toBeNull();
    expect(openLineOauthTicket(sealed, t.iat + (LINE_OAUTH_TTL_SEC - 5) * 1000)).not.toBeNull();
  });
  it("authorize URL carries code+PKCE+nonce+scopes and honours LINE_OAUTH_BASE", () => {
    const u = new URL(buildLineAuthorizeUrl({ channelId: CHANNEL_ID, redirectUri: "https://shop.example/api/auth/line/callback", state: "s1", nonce: "n1", codeChallenge: "c1" }));
    expect(u.origin + u.pathname).toBe("https://access.line.me/oauth2/v2.1/authorize");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe(CHANNEL_ID);
    expect(u.searchParams.get("redirect_uri")).toBe("https://shop.example/api/auth/line/callback");
    expect(u.searchParams.get("state")).toBe("s1");
    expect(u.searchParams.get("nonce")).toBe("n1");
    expect(u.searchParams.get("code_challenge")).toBe("c1");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toBe("profile openid email");
    process.env.LINE_OAUTH_BASE = "http://localhost:3000/api/dev/line-mock/";
    process.env.LINE_API_BASE = "http://localhost:3000/api/dev/line-mock";
    expect(buildLineAuthorizeUrl({ channelId: CHANNEL_ID, redirectUri: "x", state: "s", nonce: "n", codeChallenge: "c" })).toMatch(/^http:\/\/localhost:3000\/api\/dev\/line-mock\/oauth2\/v2\.1\/authorize\?/);
    expect(lineEndpoints()).toEqual({
      authorize: "http://localhost:3000/api/dev/line-mock/oauth2/v2.1/authorize",
      token: "http://localhost:3000/api/dev/line-mock/oauth2/v2.1/token",
      verify: "http://localhost:3000/api/dev/line-mock/oauth2/v2.1/verify",
      profile: "http://localhost:3000/api/dev/line-mock/v2/profile",
    });
  });
});

/* ------------------------------------------------------------------ */
describe("id_token verification", () => {
  const opts = { channelId: CHANNEL_ID, channelSecret: SECRET, nonce: "n1" };
  it("accepts a valid HS256 token and returns the claims", () => {
    const r = verifyLineIdToken(idToken(), opts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.claims.sub).toBe("U0000000000000000000000000000001");
      expect(r.claims.name).toBe("สมชาย ใจดี");
      expect(r.claims.email).toBe("somchai@example.com");
    }
  });
  const bad = (name: string, token: string, detail: string) =>
    it(`rejects ${name}`, () => {
      expect(() => verifyLineIdToken(token, opts)).toThrow(LineLoginError);
      try {
        verifyLineIdToken(token, opts);
      } catch (e) {
        expect((e as LineLoginError).code).toBe("invalid_token");
        expect((e as Error).message).toContain(detail);
      }
    });
  bad("a wrong signature (other channel secret)", idToken({}, "ffffffffffffffffffffffffffffffff"), "signature");
  bad("a wrong issuer", idToken({ iss: "https://evil.example" }), "issuer");
  bad("a wrong audience (another tenant's channel)", idToken({ aud: "9999999999" }), "audience");
  bad("an expired token", idToken({ exp: nowSec() - 120 }), "expired");
  bad("a nonce mismatch (replayed token)", idToken({ nonce: "other" }), "nonce");
  bad("alg=none", `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify({ iss: LINE_ID_TOKEN_ISSUER, sub: "U1", aud: CHANNEL_ID, exp: nowSec() + 60, iat: nowSec() })).toString("base64url")}.`, "alg none");
  bad("garbage", "not-a-jwt", "malformed");
  it("tolerates small clock skew but not minutes", () => {
    expect(verifyLineIdToken(idToken({ exp: nowSec() - 30 }), opts).ok).toBe(true);
    expect(verifyLineIdToken(idToken({ iat: nowSec() + 30 }), opts).ok).toBe(true);
  });
  it("hands ES256 tokens to the remote verifier (cannot be checked with the secret)", () => {
    expect(verifyLineIdToken(idToken({}, SECRET, { alg: "ES256" }), opts)).toEqual({ ok: false, reason: "unsupported_alg" });
  });
  it("works without a nonce requirement", () => {
    expect(verifyLineIdToken(idToken({ nonce: undefined }), { channelId: CHANNEL_ID, channelSecret: SECRET }).ok).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
describe("token exchange + identity resolution (mocked endpoints)", () => {
  const base = { channelId: CHANNEL_ID, channelSecret: SECRET, code: "code-1", redirectUri: "https://shop.example/api/auth/line/callback", codeVerifier: "verifier-1", nonce: "n1" };

  it("posts the authorization_code grant with PKCE and the channel credentials", async () => {
    const f = fakeFetch({ "/oauth2/v2.1/token": () => ({ status: 200, body: { access_token: "at", id_token: idToken(), scope: "profile openid email", token_type: "Bearer", expires_in: 2592000 } }) });
    const r = await exchangeLineCode({ ...base, fetchImpl: f.impl });
    expect(r.accessToken).toBe("at");
    expect(r.idToken).toBeTruthy();
    const form = new URLSearchParams(f.calls[0]!.init!.body!);
    expect(f.calls[0]!.url).toBe("https://api.line.me/oauth2/v2.1/token");
    expect(f.calls[0]!.init!.method).toBe("POST");
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("code-1");
    expect(form.get("redirect_uri")).toBe(base.redirectUri);
    expect(form.get("client_id")).toBe(CHANNEL_ID);
    expect(form.get("client_secret")).toBe(SECRET);
    expect(form.get("code_verifier")).toBe("verifier-1");
  });
  it("maps invalid_client to invalid_credentials and other failures to token_failed", async () => {
    const bad = fakeFetch({ "/oauth2/v2.1/token": () => ({ status: 400, body: { error: "invalid_client" } }) });
    await expect(exchangeLineCode({ ...base, fetchImpl: bad.impl })).rejects.toMatchObject({ code: "invalid_credentials" });
    const grant = fakeFetch({ "/oauth2/v2.1/token": () => ({ status: 400, body: { error: "invalid_grant", error_description: "code expired" } }) });
    await expect(exchangeLineCode({ ...base, fetchImpl: grant.impl })).rejects.toMatchObject({ code: "token_failed" });
    const down = async () => {
      throw new Error("ECONNREFUSED");
    };
    await expect(exchangeLineCode({ ...base, fetchImpl: down as never })).rejects.toMatchObject({ code: "token_failed" });
  });
  it("resolves the identity from a locally verified id_token (no profile call)", async () => {
    const f = fakeFetch({ "/oauth2/v2.1/token": () => ({ status: 200, body: { access_token: "at", id_token: idToken() } }), "/v2/profile": () => ({ status: 500, body: {} }) });
    const id = await resolveLineIdentity({ ...base, fetchImpl: f.impl });
    expect(id).toEqual({ userId: "U0000000000000000000000000000001", displayName: "สมชาย ใจดี", pictureUrl: "https://profile.line-scdn.net/abc", email: "somchai@example.com" });
    expect(f.calls.map((c) => c.url.split("/").slice(-2).join("/"))).toEqual(["v2.1/token"]);
  });
  it("rejects an id_token for another channel even though the exchange succeeded", async () => {
    const f = fakeFetch({ "/oauth2/v2.1/token": () => ({ status: 200, body: { access_token: "at", id_token: idToken({ aud: "5555555555" }) } }) });
    await expect(resolveLineIdentity({ ...base, fetchImpl: f.impl })).rejects.toMatchObject({ code: "invalid_token" });
  });
  it("falls back to the profile endpoint when there is no id_token", async () => {
    const f = fakeFetch({
      "/oauth2/v2.1/token": () => ({ status: 200, body: { access_token: "at-2" } }),
      "/v2/profile": (c) => (c.init?.headers?.authorization === "Bearer at-2" ? { status: 200, body: { userId: "U77", displayName: "สมหญิง", pictureUrl: "https://profile.line-scdn.net/x" } } : { status: 401, body: {} }),
    });
    const id = await resolveLineIdentity({ ...base, fetchImpl: f.impl });
    expect(id).toEqual({ userId: "U77", displayName: "สมหญิง", pictureUrl: "https://profile.line-scdn.net/x", email: null });
  });
  it("asks LINE's verify endpoint for ES256 tokens and still checks aud/nonce on the answer", async () => {
    const es = idToken({}, SECRET, { alg: "ES256" });
    const f = fakeFetch({
      "/oauth2/v2.1/token": () => ({ status: 200, body: { access_token: "at", id_token: es } }),
      "/oauth2/v2.1/verify": (c) => {
        const form = new URLSearchParams(c.init?.body ?? "");
        expect(form.get("id_token")).toBe(es);
        expect(form.get("client_id")).toBe(CHANNEL_ID);
        expect(form.get("nonce")).toBe("n1");
        return { status: 200, body: { iss: LINE_ID_TOKEN_ISSUER, sub: "U99", aud: CHANNEL_ID, exp: nowSec() + 60, iat: nowSec(), nonce: "n1", name: "ES" } };
      },
    });
    const id = await resolveLineIdentity({ ...base, fetchImpl: f.impl });
    expect(id.userId).toBe("U99");
    const forged = fakeFetch({
      "/oauth2/v2.1/token": () => ({ status: 200, body: { access_token: "at", id_token: es } }),
      "/oauth2/v2.1/verify": () => ({ status: 200, body: { iss: LINE_ID_TOKEN_ISSUER, sub: "U99", aud: "other", exp: nowSec() + 60, iat: nowSec(), nonce: "n1" } }),
    });
    await expect(resolveLineIdentity({ ...base, fetchImpl: forged.impl })).rejects.toMatchObject({ code: "invalid_token" });
  });
  it("drops non-https picture URLs in production-like checks", async () => {
    const f = fakeFetch({ "/oauth2/v2.1/token": () => ({ status: 200, body: { access_token: "at", id_token: idToken({ picture: "javascript:alert(1)" }) } }) });
    expect((await resolveLineIdentity({ ...base, fetchImpl: f.impl })).pictureUrl).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
describe("settings + credential validation", () => {
  it("enabled flag lives in tenants.settings.lineLogin.enabled", () => {
    expect(isLineLoginEnabled({})).toBe(false);
    expect(isLineLoginEnabled({ lineLogin: { enabled: "true" } })).toBe(false);
    expect(isLineLoginEnabled({ lineLogin: { enabled: true } })).toBe(true);
    expect(isLineLoginEnabled(null)).toBe(false);
  });
  it("validates channel id / secret shapes with Thai errors", () => {
    expect(lineChannelIdError("")).toMatch(/Channel ID/);
    expect(lineChannelIdError("abc")).toMatch(/ตัวเลข/);
    expect(lineChannelIdError(" 1234567890 ")).toBeNull();
    expect(lineChannelSecretError("")).toMatch(/Channel secret/);
    expect(lineChannelSecretError("short")).toMatch(/อักขระ/);
    expect(lineChannelSecretError(SECRET)).toBeNull();
    expect(lineCredentialWarnings(CHANNEL_ID, SECRET)).toEqual([]);
    expect(lineCredentialWarnings("12345", "notahexsecret-but-long-enough")).toHaveLength(2);
    expect(lineCredentialWarnings(CHANNEL_ID, null)).toEqual([]);
  });
  it("every error code has a Thai message", () => {
    for (const [code, msg] of Object.entries(LINE_LOGIN_ERROR_MESSAGES)) {
      expect(isLineLoginErrorCode(code)).toBe(true);
      expect(msg).toMatch(/[฀-๿]/);
    }
    expect(isLineLoginErrorCode("constructor")).toBe(false);
    expect(isLineLoginErrorCode("")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
describe("customers: find-or-create / link / unlink (PGlite)", () => {
  let db: TestDb;
  let tenantA: string;
  let tenantB: string;
  let seq = 0;
  const uid = () => `U${String(++seq).padStart(32, "0")}`;
  const txA = <T>(fn: (t: Tx) => Promise<T>) => withTenant(db, tenantA, fn);
  const txB = <T>(fn: (t: Tx) => Promise<T>) => withTenant(db, tenantB, fn);
  const identity = (over: Partial<LineIdentity> = {}): LineIdentity => ({ userId: uid(), displayName: "สมชาย ใจดี", pictureUrl: "https://profile.line-scdn.net/p1", email: null, ...over });

  async function otpLogin(tenantId: string, target: { kind: "phone" | "email"; value: string }) {
    const t = <T>(fn: (x: Tx) => Promise<T>) => withTenant(db, tenantId, fn);
    const { code } = await t((x) => requestOtp(x, tenantId, target));
    const r = await t((x) => verifyOtp(x, tenantId, target, code, { name: "ลูกค้า OTP" }));
    if (!r.ok) throw new Error(r.error);
    return r;
  }
  const row = async (tenantId: string, id: string) => {
    const [r] = await withTenant(db, tenantId, (t) => t.select().from(customers).where(eq(customers.id, id)));
    return r!;
  };

  beforeAll(async () => {
    ({ db } = await createTestDb());
    const [a] = await db.insert(tenants).values({ slug: "t-line-a", name: "Line A", siteType: "shop" }).returning({ id: tenants.id });
    const [b] = await db.insert(tenants).values({ slug: "t-line-b", name: "Line B", siteType: "shop" }).returning({ id: tenants.id });
    tenantA = a!.id;
    tenantB = b!.id;
  });

  it("stores credentials encrypted in tenant_secrets, secret write-only with a hint", async () => {
    await txA((t) => saveLineLoginCredentials(t, tenantA, { channelId: CHANNEL_ID, channelSecret: SECRET }));
    const creds = await txA((t) => getLineLoginCredentials(t, tenantA));
    expect(creds).toEqual({ channelId: CHANNEL_ID, channelSecret: SECRET });
    const status = await txA((t) => getLineLoginStatus(t, tenantA));
    expect(status).toEqual({ channelId: CHANNEL_ID, secretHint: "cdef", configured: true });
    // raw rows are ciphertext, not the values
    const raw = await db.execute(`select key, ciphertext, hint from tenant_secrets where tenant_id = '${tenantA}' order by key`);
    const rows = raw.rows as Array<{ key: string; ciphertext: string; hint: string }>;
    expect(rows.map((r) => r.key)).toEqual([LINE_LOGIN_SECRET_KEYS.channelId, LINE_LOGIN_SECRET_KEYS.channelSecret]);
    for (const r of rows) expect(r.ciphertext).not.toContain(r.key === LINE_LOGIN_SECRET_KEYS.channelId ? CHANNEL_ID : SECRET);
    // omit the secret → channel id updates, secret kept
    await txA((t) => saveLineLoginCredentials(t, tenantA, { channelId: "2222222222" }));
    expect(await txA((t) => getLineLoginCredentials(t, tenantA))).toEqual({ channelId: "2222222222", channelSecret: SECRET });
    // other tenant sees nothing (RLS + key scoping)
    expect(await txB((t) => getLineLoginCredentials(t, tenantB))).toBeNull();
    expect(await txB((t) => getLineLoginStatus(t, tenantB))).toEqual({ channelId: null, secretHint: null, configured: false });
    await txA((t) => clearLineLoginCredentials(t, tenantA));
    expect(await txA((t) => getLineLoginCredentials(t, tenantA))).toBeNull();
    await expect(txA((t) => saveLineLoginCredentials(t, tenantA, { channelId: "abc", channelSecret: SECRET }))).rejects.toThrow(/ตัวเลข/);
    // generic helpers
    await txA((t) => writeTenantSecret(t, tenantA, "x_key", "abcd1234"));
    expect(await txA((t) => readTenantSecret(t, tenantA, "x_key"))).toBe("abcd1234");
  });

  it("first LINE login creates a customer keyed by lineUserId only (no e-mail / phone) and opens a session", async () => {
    const id = identity({ email: "somchai@example.com" });
    const r = await txA((t) => signInWithLine(t, tenantA, id, { ip: "203.0.113.5", userAgent: "ua" }));
    expect(r.ok && r.mode === "login" && r.isNew).toBe(true);
    if (!r.ok || r.mode !== "login") return;
    const c = await row(tenantA, r.customer.id);
    expect(c.lineUserId).toBe(id.userId);
    expect(c.name).toBe("สมชาย ใจดี");
    expect(c.avatar).toBe("https://profile.line-scdn.net/p1");
    expect(c.email).toBeNull();
    expect(c.phone).toBeNull();
    expect(await txA((t) => getCustomerByToken(t, tenantA, r.token))).toMatchObject({ id: r.customer.id, lineUserId: id.userId });
  });

  it("the same LINE user logs in as the same customer again (and gets the fresh picture)", async () => {
    const id = identity();
    const first = await txA((t) => signInWithLine(t, tenantA, id));
    const second = await txA((t) => signInWithLine(t, tenantA, { ...id, pictureUrl: "https://profile.line-scdn.net/p2" }));
    expect(first.ok && second.ok && first.mode === "login" && second.mode === "login").toBe(true);
    if (!first.ok || !second.ok || first.mode !== "login" || second.mode !== "login") return;
    expect(second.customer.id).toBe(first.customer.id);
    expect(second.isNew).toBe(false);
    expect(second.token).not.toBe(first.token);
    expect((await row(tenantA, first.customer.id)).avatar).toBe("https://profile.line-scdn.net/p2");
  });

  it("NEVER merges with an existing customer that has the same e-mail", async () => {
    const email = `same-${Date.now()}@example.com`;
    const otp = await otpLogin(tenantA, { kind: "email", value: email });
    const r = await txA((t) => signInWithLine(t, tenantA, identity({ email })));
    expect(r.ok && r.mode === "login" && r.isNew).toBe(true);
    if (!r.ok || r.mode !== "login") return;
    expect(r.customer.id).not.toBe(otp.customer.id);
    expect(r.customer.email).toBeNull();
    const original = await row(tenantA, otp.customer.id);
    expect(original.lineUserId).toBeNull();
    expect(original.email).toBe(email);
  });

  it("a signed-in customer LINKS the LINE id instead of logging in, then can log in with LINE", async () => {
    const otp = await otpLogin(tenantA, { kind: "phone", value: "0891000001" });
    const id = identity({ displayName: "ชื่อจาก LINE" });
    const link = await txA((t) => signInWithLine(t, tenantA, id, { currentCustomerId: otp.customer.id }));
    expect(link).toMatchObject({ ok: true, mode: "linked", customer: { id: otp.customer.id, lineUserId: id.userId } });
    const c = await row(tenantA, otp.customer.id);
    expect(c.lineUserId).toBe(id.userId);
    expect(c.name).toBe("ลูกค้า OTP"); // existing name wins
    expect(c.phone).toBe("0891000001");
    // linking again with the same LINE id is idempotent
    expect(await txA((t) => signInWithLine(t, tenantA, id, { currentCustomerId: otp.customer.id }))).toMatchObject({ ok: true, mode: "linked" });
    // now a plain LINE login (no session) lands on that customer
    const login = await txA((t) => signInWithLine(t, tenantA, id));
    expect(login).toMatchObject({ ok: true, mode: "login", isNew: false, customer: { id: otp.customer.id } });
  });

  it("refuses to link a LINE id that already belongs to another customer", async () => {
    const id = identity();
    const owner = await txA((t) => signInWithLine(t, tenantA, id));
    const other = await otpLogin(tenantA, { kind: "phone", value: "0891000002" });
    const r = await txA((t) => signInWithLine(t, tenantA, id, { currentCustomerId: other.customer.id }));
    expect(r).toEqual({ ok: false, error: "already_linked" });
    expect((await row(tenantA, other.customer.id)).lineUserId).toBeNull();
    if (owner.ok) expect((await row(tenantA, owner.customer.id)).lineUserId).toBe(id.userId);
  });

  it("a stale / foreign currentCustomerId falls back to a normal login", async () => {
    const id = identity();
    const r = await txA((t) => signInWithLine(t, tenantA, id, { currentCustomerId: "018f0000-0000-7000-8000-000000000000" }));
    expect(r.ok && r.mode === "login").toBe(true);
  });

  it("the same LINE user on two tenants is two separate customers", async () => {
    const id = identity();
    const a = await txA((t) => signInWithLine(t, tenantA, id));
    const b = await txB((t) => signInWithLine(t, tenantB, id));
    expect(a.ok && b.ok && a.mode === "login" && b.mode === "login").toBe(true);
    if (!a.ok || !b.ok || a.mode !== "login" || b.mode !== "login") return;
    expect(a.customer.id).not.toBe(b.customer.id);
    expect(a.isNew && b.isNew).toBe(true);
    // tenant B's session token is not valid on tenant A
    expect(await txA((t) => getCustomerByToken(t, tenantA, b.token))).toBeNull();
  });

  it("a blocked customer gets no session and cannot link", async () => {
    const id = identity();
    const first = await txA((t) => signInWithLine(t, tenantA, id));
    if (!first.ok) throw new Error("setup");
    await txA((t) => t.update(customers).set({ blockedAt: new Date() }).where(eq(customers.id, first.customer.id)));
    expect(await txA((t) => signInWithLine(t, tenantA, id))).toEqual({ ok: false, error: "blocked" });
    expect(await txA((t) => signInWithLine(t, tenantA, identity(), { currentCustomerId: first.customer.id }))).toEqual({ ok: false, error: "blocked" });
  });

  it("unlink: refused for LINE-only customers, allowed when a phone / e-mail remains", async () => {
    const only = await txA((t) => signInWithLine(t, tenantA, identity()));
    if (!only.ok) throw new Error("setup");
    expect(await txA((t) => unlinkLine(t, tenantA, only.customer.id))).toEqual({ ok: false, error: "no_other_login" });
    expect((await row(tenantA, only.customer.id)).lineUserId).not.toBeNull();

    const otp = await otpLogin(tenantA, { kind: "phone", value: "0891000003" });
    const id = identity();
    await txA((t) => signInWithLine(t, tenantA, id, { currentCustomerId: otp.customer.id }));
    const r = await txA((t) => unlinkLine(t, tenantA, otp.customer.id));
    expect(r).toMatchObject({ ok: true, customer: { id: otp.customer.id, lineUserId: null } });
    expect((await row(tenantA, otp.customer.id)).lineUserId).toBeNull();
    expect(await txA((t) => unlinkLine(t, tenantA, otp.customer.id))).toEqual({ ok: false, error: "not_linked" });
    // after unlinking, the LINE id is free again → a fresh LINE login creates a new customer, not the old one
    const again = await txA((t) => signInWithLine(t, tenantA, id));
    expect(again.ok && again.mode === "login" && again.isNew && again.customer.id !== otp.customer.id).toBe(true);
  });
});
