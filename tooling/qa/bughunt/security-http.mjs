// Tiny HTTP helpers for the security bughunt (Node 24 fetch). Usage: import { ... } from "./security-http.mjs"
import { readFileSync, writeFileSync, existsSync } from "node:fs";
export const ADMIN = "http://localhost:3001";
const idsFile = new URL("./security-action-ids.txt", import.meta.url);
export function actionId(name, fileHint = "") {
  const lines = readFileSync(idsFile, "utf8").split("\n").filter(Boolean).map((l) => l.split(" "));
  const hit = lines.filter((l) => l[2] === name && l[3].includes(fileHint));
  if (hit.length !== 1) throw new Error(`action ${name} ${fileHint}: ${hit.length} matches ${hit.map((h) => h[3]).join(",")}`);
  return hit[0][1];
}
const credsFile = new URL("./security-creds.json", import.meta.url);
export function creds() { return existsSync(credsFile) ? JSON.parse(readFileSync(credsFile, "utf8")) : {}; }
export function saveCreds(c) { writeFileSync(credsFile, JSON.stringify(c, null, 2)); }
function cookieFrom(res) {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}
export async function signUp(email, password, name) {
  const r = await fetch(`${ADMIN}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: ADMIN }, body: JSON.stringify({ email, password, name }) });
  return { status: r.status, cookie: cookieFrom(r), body: await r.text() };
}
export async function signIn(email, password) {
  const r = await fetch(`${ADMIN}/api/auth/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: ADMIN }, body: JSON.stringify({ email, password }) });
  return { status: r.status, cookie: cookieFrom(r), body: (await r.text()).slice(0, 200) };
}
/** Calls a Next server action by id with JSON args. Returns status + raw RSC text. */
export async function callAction(base, cookie, id, args, path = "/") {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "next-action": id, "content-type": "text/plain;charset=UTF-8", accept: "text/x-component", origin: base, cookie: cookie ?? "" },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  return { status: r.status, location: r.headers.get("location") ?? r.headers.get("x-action-redirect"), text: text.slice(0, 1500) };
}
export async function get(url, cookie, extra = {}) {
  const r = await fetch(url, { redirect: "manual", headers: { cookie: cookie ?? "", ...extra } });
  return { status: r.status, location: r.headers.get("location"), text: await r.text() };
}
// direct DB access (admin URL) for read-only peeks / throwaway-tenant setup
import { createRequire } from "node:module";
let _sql;
export function db() {
  if (_sql) return _sql;
  const env = Object.fromEntries(readFileSync(new URL("../../../.env", import.meta.url), "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
  const postgres = createRequire(new URL("../../../packages/db/package.json", import.meta.url))("postgres");
  _sql = postgres(env.DATABASE_ADMIN_URL ?? env.DATABASE_URL, { max: 2, onnotice: () => {} });
  return _sql;
}
export const WEB = "http://localhost:3000";
/** Server action on a tenant storefront (host via x-forwarded-host). args may contain "$K1" = the FormData entries. */
export async function callWebAction(host, cookie, id, args, path = "/", formEntries = null) {
  let body, ct = {};
  if (formEntries) {
    body = new FormData();
    for (const [k, v] of Object.entries(formEntries)) body.append(`_1_${k}`, v);
    body.append("0", JSON.stringify(args)); // root must come after the referenced entries
  } else { body = JSON.stringify(args); ct = { "content-type": "text/plain;charset=UTF-8" }; }
  const r = await fetch(`${WEB}${path}`, { method: "POST", redirect: "manual", headers: { "next-action": id, accept: "text/x-component", origin: `http://${host}`, "x-forwarded-host": host, cookie: cookie ?? "", ...ct }, body });
  const text = await r.text();
  return { status: r.status, location: r.headers.get("location") ?? r.headers.get("x-action-redirect"), setCookie: (r.headers.getSetCookie?.() ?? []).join(" || "), text };
}
export async function webGet(host, path, cookie = "", extra = {}) {
  const r = await fetch(`${WEB}${path}`, { redirect: "manual", headers: { "x-forwarded-host": host, cookie, ...extra } });
  return { status: r.status, location: r.headers.get("location"), headers: r.headers, text: await r.text() };
}
export const TENANTS = { shop: "01a14029-0480-768b-9665-6161a17c1ff0", cafe: "01a14029-1ba0-70cf-b6a7-6757e7484ad6", clinic: "01a1401b-c042-734c-91a5-94f4d80448cb", restaurant: "01a14020-1268-741c-8c59-82ec1eb9fae2", salon: "01a1401b-aa4d-7699-9089-f969fedff469", corporate: "01a13ec5-8b2c-77d8-bc34-9534fd5e6ac5" };
/** OTP login on a storefront; returns cookie string "rw_customer=..." */
export async function customerLogin(host, tenantId, target) {
  const req = await callWebAction(host, "", actionId("requestOtpAction", "account"), [tenantId, { step: "target" }, "$K1"], "/account/login", { target });
  const code = req.text.match(/"devCode":"(\d{6})"/)?.[1];
  if (!code) throw new Error("no devCode: " + req.text.slice(0, 300));
  const v = await callWebAction(host, "", actionId("verifyOtpAction", "account"), [tenantId, "/account", { step: "code", target }, "$K1"], "/account/login", { target, code });
  const m = v.setCookie.match(/rw_customer=[^;]+/);
  return { cookie: m?.[0] ?? "", setCookie: v.setCookie, status: v.status, location: v.location };
}
