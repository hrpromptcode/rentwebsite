/**
 * PF-6 (auth follow-up, SEC-007 note) against the running storefront (sec-u1shop, guest OTP login):
 *   - a client-supplied X-Forwarded-For is not what the OTP row records (TRUSTED_PROXY unset in .env) — the
 *     X-Real-IP fallback is, and with neither the IP stays null (per-IP limit skipped, per-target limits hold)
 *   - the customer cookie's `secure` flag follows the request protocol: plain http → no Secure; a request that
 *     arrived over https (x-forwarded-proto: https, as a TLS-terminating proxy sends it) → Secure — on a *.localhost
 *     host, where the old host-name rule always said "not secure".
 * Run from tooling/:  npx tsx qa/bughunt/fixes/PF-6-verify.ts
 */
// @ts-expect-error plain .mjs helper
import { WEB, actionId, db } from "../security-http.mjs";

const host = "sec-u1shop.localhost:3000";
const sql = db();
let failures = 0;
const check = (name: string, ok: boolean, info = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
};
if (process.env.TRUSTED_PROXY) console.log(`note: TRUSTED_PROXY=${process.env.TRUSTED_PROXY} in this shell (the dev server reads its own env)`);

async function action(id: string, args: unknown[], entries: Record<string, string>, extra: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(entries)) body.append(`_1_${k}`, v);
  body.append("0", JSON.stringify(args));
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${WEB}/account/login`, { method: "POST", redirect: "manual", headers: { "next-action": id, accept: "text/x-component", origin: `http://${host}`, "x-forwarded-host": host, ...extra }, body });
    const text = await r.text();
    if (r.status < 500) return { status: r.status, text, setCookie: (r.headers.getSetCookie?.() ?? []).join(" || ") };
    await new Promise((res) => setTimeout(res, 10_000));
  }
  throw new Error("storefront kept answering 5xx");
}

const [t] = await sql`select id from tenants where slug='sec-u1shop'`;
const REQ = actionId("requestOtpAction", "account");
const VERIFY = actionId("verifyOtpAction", "account");
const phone = (n: number) => `0890006${String(Date.now() % 1000).padStart(3, "0")}${n}`.slice(0, 10);

async function otpIp(target: string, extra: Record<string, string>) {
  const r = await action(REQ, [t.id, { step: "target" }, "$K1"], { target }, extra);
  const code = r.text.match(/"devCode":"(\d{6})"/)?.[1] ?? null;
  const [row] = await sql`select ip from customer_otps where tenant_id=${t.id} and target=${target} order by created_at desc limit 1`;
  return { ip: row?.ip ?? null, code, found: !!row };
}

// 1. spoofed X-Forwarded-For alone
const t1 = phone(1);
const r1 = await otpIp(t1, { "x-forwarded-for": "6.6.6.6" });
check("spoofed X-Forwarded-For is not recorded as the client IP", r1.found && r1.ip !== "6.6.6.6", `stored ip ${r1.ip}`);
// 2. X-Forwarded-For + X-Real-IP → X-Real-IP
const t2 = phone(2);
const r2 = await otpIp(t2, { "x-forwarded-for": "6.6.6.7, 10.0.0.1", "x-real-ip": "198.51.100.33" });
check("X-Real-IP is the fallback when X-Forwarded-For is untrusted", r2.found && r2.ip === "198.51.100.33", `stored ip ${r2.ip}`);

// 3./4. cookie secure flag from the protocol
async function loginCookie(n: number, extra: Record<string, string>) {
  const target = phone(n);
  const o = await otpIp(target, extra);
  if (!o.code) throw new Error("no dev OTP code");
  const v = await action(VERIFY, [t.id, "/account", { step: "code", target }, "$K1"], { target, code: o.code }, extra);
  return v.setCookie.split(" || ").find((c) => c.startsWith("rw_customer=")) ?? "";
}
const plain = await loginCookie(3, {});
check("http request → rw_customer cookie without Secure", !!plain && !/;\s*secure/i.test(plain), plain.replace(/=[^;]+/, "=…"));
const tls = await loginCookie(4, { "x-forwarded-proto": "https" });
check("https request (x-forwarded-proto: https) on a *.localhost host → Secure cookie", !!tls && /;\s*secure/i.test(tls), tls.replace(/=[^;]+/, "=…"));

await sql.end();
console.log(failures ? `FAIL (${failures})` : "PASS all");
process.exit(failures ? 1 : 0);
