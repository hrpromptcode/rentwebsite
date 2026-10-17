import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { customers, tenantSecrets, type Tx } from "@rentweb/db";
import { decrypt, decryptFromString, encrypt, encryptToString, safeEqual } from "../crypto";
import { createCustomerSession, type CustomerSummary } from "./index";

/**
 * LINE Login (OAuth 2.1 authorization code + PKCE + OpenID Connect) for storefront customers, per tenant.
 *
 * Identity rules (same spirit as the OTP rules in ./index.ts):
 * - A customer is found or created BY lineUserId ONLY. The e-mail LINE reports is never used to look a customer up
 *   and never written to the record (it is not verified by us, and would let anyone who controls a LINE account
 *   with that e-mail take over a stranger's e-mail-only account).
 * - When a customer session is already active, the LINE id is LINKED to that customer instead of logging in.
 *   A LINE id already linked to a different customer is refused in that case ("already_linked").
 * - The same LINE user on two tenants is two separate customers (customers are per tenant).
 *
 * Per-tenant credentials live encrypted in tenant_secrets (`line_login_channel_id`, `line_login_channel_secret`),
 * the on/off switch in tenants.settings.lineLogin.enabled (cached with the tenant config, so the login page can
 * decide without a secrets query). LINE endpoints are configurable through LINE_OAUTH_BASE / LINE_API_BASE so
 * tests and the dev journey can point them at a mock provider.
 */

/* ------------------------------------------------------------------ */
/* Endpoints / constants                                                */
/* ------------------------------------------------------------------ */

export const LINE_ID_TOKEN_ISSUER = "https://access.line.me";
export const LINE_LOGIN_SCOPES = "profile openid email";
/** httpOnly cookie that carries the state / nonce / PKCE verifier between /start and /callback. */
export const LINE_OAUTH_COOKIE = "rw_line_oauth";
export const LINE_OAUTH_TTL_SEC = 10 * 60;

/** Base of the user-facing authorize page (browser redirect). */
export function lineOauthBase(): string {
  return (process.env.LINE_OAUTH_BASE || LINE_ID_TOKEN_ISSUER).replace(/\/+$/, "");
}

/** Base of the server-to-server endpoints (token, verify, profile). */
export function lineApiBase(): string {
  return (process.env.LINE_API_BASE || "https://api.line.me").replace(/\/+$/, "");
}

export const lineEndpoints = () => ({
  authorize: `${lineOauthBase()}/oauth2/v2.1/authorize`,
  token: `${lineApiBase()}/oauth2/v2.1/token`,
  verify: `${lineApiBase()}/oauth2/v2.1/verify`,
  profile: `${lineApiBase()}/v2/profile`,
});

/* ------------------------------------------------------------------ */
/* Errors                                                               */
/* ------------------------------------------------------------------ */

export type LineLoginErrorCode =
  | "not_enabled"
  | "invalid_credentials"
  | "state_mismatch"
  | "denied"
  | "token_failed"
  | "invalid_token"
  | "profile_failed"
  | "already_linked"
  | "blocked"
  | "no_other_login"
  | "not_linked"
  | "unknown";

export class LineLoginError extends Error {
  readonly code: LineLoginErrorCode;
  constructor(code: LineLoginErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "LineLoginError";
    this.code = code;
  }
}

/** Thai messages shown on the storefront login / account page for each failure. */
export const LINE_LOGIN_ERROR_MESSAGES: Record<LineLoginErrorCode, string> = {
  not_enabled: "ร้านนี้ยังไม่เปิดให้เข้าสู่ระบบด้วย LINE",
  invalid_credentials: "การตั้งค่า LINE Login ของร้านยังไม่ถูกต้อง กรุณาติดต่อร้านหรือเข้าสู่ระบบด้วย OTP แทน",
  state_mismatch: "การเข้าสู่ระบบด้วย LINE หมดเวลาหรือไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง",
  denied: "คุณยกเลิกการเข้าสู่ระบบด้วย LINE",
  token_failed: "ไม่สามารถยืนยันตัวตนกับ LINE ได้ กรุณาลองใหม่อีกครั้ง",
  invalid_token: "ข้อมูลยืนยันตัวตนจาก LINE ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง",
  profile_failed: "ไม่สามารถดึงข้อมูลโปรไฟล์ LINE ได้ กรุณาลองใหม่อีกครั้ง",
  already_linked: "บัญชี LINE นี้เชื่อมต่อกับลูกค้าท่านอื่นอยู่แล้ว",
  blocked: "บัญชีนี้ถูกระงับการใช้งานโดยร้าน หากมีข้อสงสัยกรุณาติดต่อร้านโดยตรง",
  no_other_login: "ยกเลิกการเชื่อมต่อไม่ได้ เพราะบัญชีนี้ยังไม่มีเบอร์โทรศัพท์หรืออีเมลสำหรับเข้าสู่ระบบ",
  not_linked: "บัญชีนี้ยังไม่ได้เชื่อมต่อกับ LINE",
  unknown: "เกิดข้อผิดพลาดระหว่างเข้าสู่ระบบด้วย LINE กรุณาลองใหม่อีกครั้ง",
};

export function isLineLoginErrorCode(v: unknown): v is LineLoginErrorCode {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(LINE_LOGIN_ERROR_MESSAGES, v);
}

/* ------------------------------------------------------------------ */
/* Tenant secrets (generic helpers, integrations-free)                  */
/* ------------------------------------------------------------------ */

function hintOf(value: string): string {
  return value.length <= 4 ? "*".repeat(value.length) : value.slice(-4);
}

export async function readTenantSecret(tx: Tx, tenantId: string, key: string): Promise<string | null> {
  const [row] = await tx
    .select({ ciphertext: tenantSecrets.ciphertext, iv: tenantSecrets.iv })
    .from(tenantSecrets)
    .where(and(eq(tenantSecrets.tenantId, tenantId), eq(tenantSecrets.key, key)))
    .limit(1);
  if (!row) return null;
  try {
    return decrypt(row);
  } catch {
    return null;
  }
}

export async function readTenantSecretHint(tx: Tx, tenantId: string, key: string): Promise<string | null> {
  const [row] = await tx
    .select({ hint: tenantSecrets.hint })
    .from(tenantSecrets)
    .where(and(eq(tenantSecrets.tenantId, tenantId), eq(tenantSecrets.key, key)))
    .limit(1);
  return row ? (row.hint ?? "") : null;
}

/** Upsert one encrypted secret (hint = last 4 characters, for masked display). */
export async function writeTenantSecret(tx: Tx, tenantId: string, key: string, value: string): Promise<void> {
  const enc = encrypt(value);
  await tx
    .insert(tenantSecrets)
    .values({ tenantId, key, ciphertext: enc.ciphertext, iv: enc.iv, keyVersion: enc.keyVersion, hint: hintOf(value) })
    .onConflictDoUpdate({
      target: [tenantSecrets.tenantId, tenantSecrets.key],
      set: { ciphertext: enc.ciphertext, iv: enc.iv, keyVersion: enc.keyVersion, hint: hintOf(value), updatedAt: new Date() },
    });
}

export async function deleteTenantSecret(tx: Tx, tenantId: string, key: string): Promise<void> {
  await tx.delete(tenantSecrets).where(and(eq(tenantSecrets.tenantId, tenantId), eq(tenantSecrets.key, key)));
}

/* ------------------------------------------------------------------ */
/* Per-tenant LINE Login configuration                                  */
/* ------------------------------------------------------------------ */

export const LINE_LOGIN_SECRET_KEYS = { channelId: "line_login_channel_id", channelSecret: "line_login_channel_secret" } as const;

export interface LineLoginSettings {
  enabled: boolean;
}

/** tenants.settings.lineLogin (cached with the tenant config). */
export function lineLoginSettings(settings: Record<string, unknown> | null | undefined): LineLoginSettings {
  const raw = (settings?.lineLogin ?? {}) as Record<string, unknown>;
  return { enabled: raw.enabled === true };
}

export function isLineLoginEnabled(settings: Record<string, unknown> | null | undefined): boolean {
  return lineLoginSettings(settings).enabled;
}

/** LINE channel IDs are numeric (10 digits today). Returns the Thai error, or null when fine. */
export function lineChannelIdError(v: string): string | null {
  const s = v.trim();
  if (!s) return "กรุณากรอก Channel ID";
  if (!/^[0-9]{6,20}$/.test(s)) return "Channel ID ต้องเป็นตัวเลขล้วน (ดูได้จาก LINE Developers Console > Basic settings)";
  return null;
}

/** LINE channel secrets are 32 hex characters. Returns the Thai error, or null when fine. */
export function lineChannelSecretError(v: string): string | null {
  const s = v.trim();
  if (!s) return "กรุณากรอก Channel secret";
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(s)) return "Channel secret มีอักขระที่ไม่ถูกต้อง (ปกติเป็นตัวอักษร a-f และตัวเลข 32 ตัว)";
  return null;
}

/** Softer check used by the "ทดสอบ" button: warnings for values that are valid but unusual. */
export function lineCredentialWarnings(channelId: string, channelSecret: string | null): string[] {
  const w: string[] = [];
  if (!/^[0-9]{10}$/.test(channelId.trim())) w.push("Channel ID ของ LINE ปกติมี 10 หลัก — ตรวจสอบว่าไม่ได้คัดลอก Channel secret หรือ User ID มาแทน");
  if (channelSecret !== null && !/^[a-f0-9]{32}$/.test(channelSecret.trim())) w.push("Channel secret ของ LINE ปกติเป็นตัวอักษร a-f และตัวเลข 32 ตัว — ตรวจสอบว่าคัดลอกครบและไม่ใช่ Channel access token");
  return w;
}

export interface LineLoginCredentials {
  channelId: string;
  channelSecret: string;
}

/** Decrypted credentials, or null when either half is missing. */
export async function getLineLoginCredentials(tx: Tx, tenantId: string): Promise<LineLoginCredentials | null> {
  const [channelId, channelSecret] = await Promise.all([
    readTenantSecret(tx, tenantId, LINE_LOGIN_SECRET_KEYS.channelId),
    readTenantSecret(tx, tenantId, LINE_LOGIN_SECRET_KEYS.channelSecret),
  ]);
  if (!channelId || !channelSecret) return null;
  return { channelId, channelSecret };
}

export interface LineLoginStatus {
  /** channel id in clear (it is not a secret – it is visible in every authorize URL) */
  channelId: string | null;
  /** last 4 characters of the stored secret, null when none is stored */
  secretHint: string | null;
  /** both halves stored */
  configured: boolean;
}

export async function getLineLoginStatus(tx: Tx, tenantId: string): Promise<LineLoginStatus> {
  const [channelId, secretHint] = await Promise.all([
    readTenantSecret(tx, tenantId, LINE_LOGIN_SECRET_KEYS.channelId),
    readTenantSecretHint(tx, tenantId, LINE_LOGIN_SECRET_KEYS.channelSecret),
  ]);
  return { channelId, secretHint, configured: !!channelId && secretHint !== null };
}

/** Stores the channel id and – when given – a new secret (the secret is write-only: omit it to keep the old one). */
export async function saveLineLoginCredentials(tx: Tx, tenantId: string, input: { channelId: string; channelSecret?: string | null }): Promise<void> {
  const channelId = input.channelId.trim();
  if (lineChannelIdError(channelId)) throw new Error(lineChannelIdError(channelId)!);
  await writeTenantSecret(tx, tenantId, LINE_LOGIN_SECRET_KEYS.channelId, channelId);
  const secret = input.channelSecret?.trim();
  if (secret) {
    if (lineChannelSecretError(secret)) throw new Error(lineChannelSecretError(secret)!);
    await writeTenantSecret(tx, tenantId, LINE_LOGIN_SECRET_KEYS.channelSecret, secret);
  }
}

export async function clearLineLoginCredentials(tx: Tx, tenantId: string): Promise<void> {
  await deleteTenantSecret(tx, tenantId, LINE_LOGIN_SECRET_KEYS.channelId);
  await deleteTenantSecret(tx, tenantId, LINE_LOGIN_SECRET_KEYS.channelSecret);
}

/* ------------------------------------------------------------------ */
/* PKCE / state / ticket cookie                                         */
/* ------------------------------------------------------------------ */

const b64url = (buf: Buffer) => buf.toString("base64url");

/** S256 code challenge for a verifier (RFC 7636). */
export function pkceChallenge(codeVerifier: string): string {
  return b64url(createHash("sha256").update(codeVerifier, "ascii").digest());
}

export function createPkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = b64url(randomBytes(48)); // 64 chars, within the 43–128 range
  return { codeVerifier, codeChallenge: pkceChallenge(codeVerifier) };
}

export function randomState(): string {
  return b64url(randomBytes(24));
}

export interface LineOauthTicket {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** same-site path to land on after a successful login */
  next: string;
  /** "link" when a signed-in customer connects LINE from the account page */
  mode: "login" | "link";
  /** issued at (ms) */
  iat: number;
}

/** Everything /callback needs, sealed (AES-GCM) so the browser can neither read nor forge it. */
export function sealLineOauthTicket(ticket: LineOauthTicket): string {
  return encryptToString(JSON.stringify(ticket));
}

/** Null when missing, tampered, malformed or older than LINE_OAUTH_TTL_SEC. */
export function openLineOauthTicket(raw: string | null | undefined, now: number = Date.now()): LineOauthTicket | null {
  if (!raw) return null;
  try {
    const t = JSON.parse(decryptFromString(raw)) as Partial<LineOauthTicket>;
    if (typeof t.state !== "string" || typeof t.nonce !== "string" || typeof t.codeVerifier !== "string" || typeof t.iat !== "number") return null;
    if (now - t.iat > LINE_OAUTH_TTL_SEC * 1000 || t.iat - now > 60_000) return null;
    return { state: t.state, nonce: t.nonce, codeVerifier: t.codeVerifier, next: typeof t.next === "string" ? t.next : "/account", mode: t.mode === "link" ? "link" : "login", iat: t.iat };
  } catch {
    return null;
  }
}

export function createLineOauthTicket(opts: { next: string; mode: "login" | "link" }): LineOauthTicket {
  const { codeVerifier } = createPkce();
  return { state: randomState(), nonce: randomState(), codeVerifier, next: opts.next, mode: opts.mode, iat: Date.now() };
}

export function buildLineAuthorizeUrl(p: { channelId: string; redirectUri: string; state: string; nonce: string; codeChallenge: string; scope?: string; prompt?: "consent"; botPrompt?: "normal" | "aggressive" }): string {
  const u = new URL(lineEndpoints().authorize);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.channelId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("state", p.state);
  u.searchParams.set("scope", p.scope ?? LINE_LOGIN_SCOPES);
  u.searchParams.set("nonce", p.nonce);
  u.searchParams.set("code_challenge", p.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (p.prompt) u.searchParams.set("prompt", p.prompt);
  if (p.botPrompt) u.searchParams.set("bot_prompt", p.botPrompt);
  return u.toString();
}

/* ------------------------------------------------------------------ */
/* Token exchange / id_token verification / profile                     */
/* ------------------------------------------------------------------ */

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

async function readJson(res: { json(): Promise<unknown>; text(): Promise<string> }): Promise<Record<string, unknown>> {
  try {
    const j = await res.json();
    return j && typeof j === "object" ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export interface LineTokenResponse {
  accessToken: string;
  idToken: string | null;
  scope: string | null;
}

/** authorization_code grant with PKCE. Throws LineLoginError("token_failed" | "invalid_credentials"). */
export async function exchangeLineCode(p: { channelId: string; channelSecret: string; code: string; redirectUri: string; codeVerifier: string; fetchImpl?: FetchLike }): Promise<LineTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: p.code,
    redirect_uri: p.redirectUri,
    client_id: p.channelId,
    client_secret: p.channelSecret,
    code_verifier: p.codeVerifier,
  });
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await (p.fetchImpl ?? defaultFetch)(lineEndpoints().token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  } catch (e) {
    throw new LineLoginError("token_failed", e instanceof Error ? e.message : String(e));
  }
  const json = await readJson(res);
  if (!res.ok) {
    const err = String(json.error ?? "");
    if (err === "invalid_client" || res.status === 401) throw new LineLoginError("invalid_credentials", `${res.status} ${err}`);
    throw new LineLoginError("token_failed", `${res.status} ${err} ${String(json.error_description ?? "").slice(0, 120)}`.trim());
  }
  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  if (!accessToken) throw new LineLoginError("token_failed", "no access_token in response");
  return { accessToken, idToken: typeof json.id_token === "string" ? json.id_token : null, scope: typeof json.scope === "string" ? json.scope : null };
}

export interface LineIdTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
  name?: string;
  picture?: string;
  email?: string;
  amr?: string[];
}

function b64urlJson(part: string): Record<string, unknown> | null {
  try {
    const j = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Header + payload without checking the signature (for choosing the verification path). */
export function decodeJwtUnverified(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const header = b64urlJson(parts[0]!);
  const payload = b64urlJson(parts[1]!);
  return header && payload ? { header, payload } : null;
}

/** HS256 JWT for tests and the dev mock (LINE signs id_tokens with HS256 using the channel secret). */
export function signHs256Jwt(payload: Record<string, unknown>, secret: string, header: Record<string, unknown> = {}): string {
  const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", ...header })).toString("base64url");
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${sig}`;
}

function checkClaims(payload: Record<string, unknown>, opts: { channelId: string; nonce?: string | null; now: number; skewSec: number }): LineIdTokenClaims {
  if (payload.iss !== LINE_ID_TOKEN_ISSUER) throw new LineLoginError("invalid_token", "issuer");
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(opts.channelId)) throw new LineLoginError("invalid_token", "audience");
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp * 1000 + opts.skewSec * 1000 < opts.now) throw new LineLoginError("invalid_token", "expired");
  const iat = Number(payload.iat);
  if (!Number.isFinite(iat) || iat * 1000 - opts.skewSec * 1000 > opts.now) throw new LineLoginError("invalid_token", "issued in the future");
  if (opts.nonce && payload.nonce !== opts.nonce) throw new LineLoginError("invalid_token", "nonce");
  if (typeof payload.sub !== "string" || !payload.sub) throw new LineLoginError("invalid_token", "subject");
  return {
    iss: String(payload.iss),
    sub: payload.sub,
    aud: String(aud[0]),
    exp,
    iat,
    nonce: typeof payload.nonce === "string" ? payload.nonce : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
    email: typeof payload.email === "string" ? payload.email : undefined,
    amr: Array.isArray(payload.amr) ? payload.amr.map(String) : undefined,
  };
}

export type LineIdTokenVerification = { ok: true; claims: LineIdTokenClaims } | { ok: false; reason: "unsupported_alg" };

/**
 * Verifies an id_token locally: HS256 signature with the channel secret, issuer https://access.line.me, audience =
 * channel id, exp / iat (±skew), nonce. Tokens signed with another algorithm (ES256 channels) cannot be checked
 * here → { ok: false, reason: "unsupported_alg" } so the caller asks LINE's verify endpoint instead.
 * Throws LineLoginError("invalid_token") for anything malformed, forged or expired.
 */
export function verifyLineIdToken(idToken: string, opts: { channelId: string; channelSecret: string; nonce?: string | null; now?: number; clockSkewSec?: number }): LineIdTokenVerification {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new LineLoginError("invalid_token", "malformed");
  const header = b64urlJson(parts[0]!);
  const payload = b64urlJson(parts[1]!);
  if (!header || !payload) throw new LineLoginError("invalid_token", "malformed");
  const alg = String(header.alg ?? "");
  if (alg !== "HS256") {
    if (alg === "ES256" || alg === "RS256") return { ok: false, reason: "unsupported_alg" };
    throw new LineLoginError("invalid_token", `alg ${alg || "none"}`);
  }
  const expected = createHmac("sha256", opts.channelSecret).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (!safeEqual(expected, parts[2]!)) throw new LineLoginError("invalid_token", "signature");
  return { ok: true, claims: checkClaims(payload, { channelId: opts.channelId, nonce: opts.nonce, now: opts.now ?? Date.now(), skewSec: opts.clockSkewSec ?? 60 }) };
}

/** POST /oauth2/v2.1/verify — LINE checks signature, issuer, audience, expiry and nonce for us. */
export async function verifyLineIdTokenRemote(idToken: string, p: { channelId: string; nonce?: string | null; fetchImpl?: FetchLike; now?: number }): Promise<LineIdTokenClaims> {
  const body = new URLSearchParams({ id_token: idToken, client_id: p.channelId });
  if (p.nonce) body.set("nonce", p.nonce);
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await (p.fetchImpl ?? defaultFetch)(lineEndpoints().verify, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  } catch (e) {
    throw new LineLoginError("invalid_token", e instanceof Error ? e.message : String(e));
  }
  const json = await readJson(res);
  if (!res.ok) throw new LineLoginError("invalid_token", `${res.status} ${String(json.error ?? "")} ${String(json.error_description ?? "").slice(0, 120)}`.trim());
  // never trust the endpoint blindly either: the claims must still match this tenant's channel and our nonce
  return checkClaims(json, { channelId: p.channelId, nonce: p.nonce, now: p.now ?? Date.now(), skewSec: 60 });
}

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl: string | null;
}

/** GET /v2/profile with the access token (used when the token response carries no id_token). */
export async function fetchLineProfile(accessToken: string, fetchImpl?: FetchLike): Promise<LineProfile> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await (fetchImpl ?? defaultFetch)(lineEndpoints().profile, { headers: { authorization: `Bearer ${accessToken}` } });
  } catch (e) {
    throw new LineLoginError("profile_failed", e instanceof Error ? e.message : String(e));
  }
  const json = await readJson(res);
  if (!res.ok || typeof json.userId !== "string" || !json.userId) throw new LineLoginError("profile_failed", `${res.status}`);
  return { userId: json.userId, displayName: typeof json.displayName === "string" ? json.displayName : "", pictureUrl: typeof json.pictureUrl === "string" ? json.pictureUrl : null };
}

export interface LineIdentity {
  userId: string;
  displayName: string | null;
  pictureUrl: string | null;
  /** reported by LINE – informational only, NEVER used to find or update a customer */
  email: string | null;
}

/** Only LINE-looking profile picture URLs are stored as avatars (never an arbitrary string from a token). */
function safePicture(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || (process.env.NODE_ENV !== "production" && u.protocol === "http:") ? url.slice(0, 500) : null;
  } catch {
    return null;
  }
}

/**
 * Code → verified identity: exchange, verify the id_token (locally, else through LINE's verify endpoint), and fall
 * back to the profile endpoint when the token response has no id_token. Throws LineLoginError.
 */
export async function resolveLineIdentity(p: { channelId: string; channelSecret: string; code: string; redirectUri: string; codeVerifier: string; nonce: string; fetchImpl?: FetchLike; now?: number }): Promise<LineIdentity> {
  const token = await exchangeLineCode(p);
  if (token.idToken) {
    const local = verifyLineIdToken(token.idToken, { channelId: p.channelId, channelSecret: p.channelSecret, nonce: p.nonce, now: p.now });
    const claims = local.ok ? local.claims : await verifyLineIdTokenRemote(token.idToken, { channelId: p.channelId, nonce: p.nonce, fetchImpl: p.fetchImpl, now: p.now });
    return { userId: claims.sub, displayName: claims.name?.trim() || null, pictureUrl: safePicture(claims.picture), email: claims.email?.trim().toLowerCase() || null };
  }
  const profile = await fetchLineProfile(token.accessToken, p.fetchImpl);
  return { userId: profile.userId, displayName: profile.displayName.trim() || null, pictureUrl: safePicture(profile.pictureUrl), email: null };
}

/* ------------------------------------------------------------------ */
/* Customers: login / link / unlink                                     */
/* ------------------------------------------------------------------ */

type CustomerRow = typeof customers.$inferSelect;

function pick(c: CustomerRow): CustomerSummary {
  return { id: c.id, name: c.name, email: c.email, phone: c.phone, lineUserId: c.lineUserId, tier: c.tier, avatar: c.avatar };
}

export type LineAuthResult =
  | { ok: true; mode: "login"; customer: CustomerSummary; token: string; expiresAt: Date; isNew: boolean }
  | { ok: true; mode: "linked"; customer: CustomerSummary }
  | { ok: false; error: "already_linked" | "blocked" };

async function findByLineUserId(tx: Tx, tenantId: string, lineUserId: string): Promise<CustomerRow | undefined> {
  const [row] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.lineUserId, lineUserId)))
    .limit(1);
  return row;
}

async function findById(tx: Tx, tenantId: string, id: string): Promise<CustomerRow | undefined> {
  const [row] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, id)))
    .limit(1);
  return row;
}

/**
 * Sign in (or sign up) with a verified LINE identity, or – when `currentCustomerId` is a signed-in customer – link
 * the LINE id to that customer. See the identity rules at the top of this file.
 */
export async function signInWithLine(
  tx: Tx,
  tenantId: string,
  identity: LineIdentity,
  opts: { currentCustomerId?: string | null; ip?: string | null; userAgent?: string | null } = {},
): Promise<LineAuthResult> {
  const lineUserId = identity.userId.trim();
  if (!lineUserId) throw new LineLoginError("invalid_token", "empty subject");
  // serialise concurrent first logins of the same LINE user on this tenant
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`line:${tenantId}:${lineUserId}`}))`);
  const existing = await findByLineUserId(tx, tenantId, lineUserId);
  const now = new Date();
  const name = identity.displayName?.trim().slice(0, 120) || null;
  const avatar = identity.pictureUrl;

  /* ---- link to the signed-in customer ---- */
  const current = opts.currentCustomerId ? await findById(tx, tenantId, opts.currentCustomerId) : undefined;
  if (current) {
    if (current.blockedAt) return { ok: false, error: "blocked" };
    if (existing && existing.id !== current.id) return { ok: false, error: "already_linked" };
    const patch: Partial<typeof customers.$inferInsert> = { lineUserId, lastSeenAt: now };
    if (!current.name && name) patch.name = name;
    if (!current.avatar && avatar) patch.avatar = avatar;
    await tx.update(customers).set(patch).where(eq(customers.id, current.id));
    return { ok: true, mode: "linked", customer: pick({ ...current, ...patch } as CustomerRow) };
  }

  /* ---- returning LINE customer ---- */
  if (existing) {
    if (existing.blockedAt) return { ok: false, error: "blocked" };
    const patch: Partial<typeof customers.$inferInsert> = {};
    if (!existing.name && name) patch.name = name;
    if (avatar && existing.avatar !== avatar) patch.avatar = avatar; // LINE picture changes over time; keep it fresh
    if (Object.keys(patch).length) await tx.update(customers).set(patch).where(eq(customers.id, existing.id));
    const session = await createCustomerSession(tx, tenantId, existing.id, opts);
    return { ok: true, mode: "login", customer: pick({ ...existing, ...patch } as CustomerRow), token: session.token, expiresAt: session.expiresAt, isNew: false };
  }

  /* ---- brand-new customer keyed by the LINE id only (no phone / e-mail) ---- */
  const [created] = await tx
    .insert(customers)
    .values({ tenantId, lineUserId, name, avatar, lastSeenAt: now })
    .onConflictDoNothing()
    .returning();
  const customer = created ?? (await findByLineUserId(tx, tenantId, lineUserId));
  if (!customer) throw new Error("line customer insert conflicted but no row found");
  const session = await createCustomerSession(tx, tenantId, customer.id, opts);
  return { ok: true, mode: "login", customer: pick(customer), token: session.token, expiresAt: session.expiresAt, isNew: !!created };
}

export type LineUnlinkResult = { ok: true; customer: CustomerSummary } | { ok: false; error: "no_other_login" | "not_linked" };

/** Removes the LINE link. Refused when LINE is the customer's only way back in (no phone and no e-mail). */
export async function unlinkLine(tx: Tx, tenantId: string, customerId: string): Promise<LineUnlinkResult> {
  const row = await findById(tx, tenantId, customerId);
  if (!row || !row.lineUserId) return { ok: false, error: "not_linked" };
  if (!row.phone && !row.email) return { ok: false, error: "no_other_login" };
  await tx.update(customers).set({ lineUserId: null }).where(and(eq(customers.id, row.id), eq(customers.tenantId, tenantId)));
  return { ok: true, customer: pick({ ...row, lineUserId: null }) };
}
