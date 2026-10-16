/**
 * SEC-003 regression: admin login/logout `next` must stay same-origin (shared helper apps/admin/src/lib/safe-next.ts).
 * Run from tooling/:  pnpm exec tsx qa/bughunt/fixes/SEC-003-verify.ts
 */
// @ts-expect-error untyped helper module
import { ADMIN, creds } from "../security-http.mjs";
import { safeNext, sanitizeNext } from "../../../../apps/admin/src/lib/safe-next";

let fails = 0;
const check = (name: string, cond: boolean, extra: unknown = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra !== "" ? " " + JSON.stringify(extra) : ""}`);
};

const EVIL = ["//evil.example/x", "/\x5cevil.example/x", "\x5c\x5cevil.example", "https://evil.example", "http:evil.example", "javascript:alert(1)", "/\t/evil.example", "/\n/evil.example", "evil.example", "", "/%5Cevil.example".replace("%5C", "\\")];
for (const n of EVIL) check(`sanitizeNext rejects ${JSON.stringify(n)}`, sanitizeNext(n) === null, sanitizeNext(n));
for (const [n, want] of [["/t/demo-shop/dashboard", "/t/demo-shop/dashboard"], ["/invite/abc?x=1#y", "/invite/abc?x=1#y"], ["/t/a/../console", "/t/console"], ["/evil.example/x", "/evil.example/x"]] as const)
  check(`sanitizeNext keeps ${n}`, sanitizeNext(n) === want, sanitizeNext(n));
check("safeNext fallback", safeNext(undefined) === "/" && safeNext("//x", "/t") === "/t");

const c = creds();
const get = async (url: string, cookie = "") => {
  const r = await fetch(url, { redirect: "manual", headers: { cookie } });
  await r.text();
  return { status: r.status, location: r.headers.get("location") };
};
const offOrigin = (loc: string | null) => {
  if (!loc) return false;
  try {
    return new URL(loc, ADMIN).origin !== new URL(ADMIN).origin;
  } catch {
    return true;
  }
};
if (c.u1?.cookie) {
  for (const n of ["//evil.example/x", "/\x5cevil.example/x", "https://evil.example", "/\t/evil.example"]) {
    const r = await get(`${ADMIN}/login?next=${encodeURIComponent(n)}`, c.u1.cookie);
    check(`live: signed-in /login?next=${JSON.stringify(n)} stays on origin`, r.status >= 300 && r.status < 400 && !offOrigin(r.location) && !/evil/.test(r.location ?? ""), r);
  }
  const ok = await get(`${ADMIN}/login?next=${encodeURIComponent("/t/sec-u1shop/dashboard")}`, c.u1.cookie);
  check("live: signed-in /login?next=/t/... still honoured", (ok.location ?? "").endsWith("/t/sec-u1shop/dashboard"), ok);
}
// signed-out login page must not hand an unsafe next to the client form
const page = await fetch(`${ADMIN}/login?next=${encodeURIComponent("/\x5cevil.example/x")}`).then((r) => r.text());
// Next echoes the raw URL in its route-tree payload; what matters is the LoginForm prop {"next":...}
// (in the HTML flight data it appears as {\"next\":\"...\"})
const nextProp = (html: string) => html.match(/\{\\?"next\\?":\\?"([^"\\]*)/)?.[1] ?? null;
check("live: signed-out login page does not pass unsafe next to LoginForm", nextProp(page) === null || nextProp(page) === "$undefined", nextProp(page));
const pageOk = await fetch(`${ADMIN}/login?next=${encodeURIComponent("/t/demo-shop/dashboard")}`).then((r) => r.text());
check("live: signed-out login page passes a safe next to LoginForm", nextProp(pageOk) === "/t/demo-shop/dashboard", nextProp(pageOk));
for (const n of ["/\x5cevil.example/x", "//evil.example", "/\t/evil.example"]) {
  const r = await get(`${ADMIN}/logout?next=${encodeURIComponent(n)}`); // no cookie: does not sign anybody out
  check(`live: /logout?next=${JSON.stringify(n)} drops next`, !!r.location && new URL(r.location, ADMIN).pathname === "/login" && !new URL(r.location, ADMIN).searchParams.has("next"), r);
}
const lg = await get(`${ADMIN}/logout?next=${encodeURIComponent("/invite/tok")}`);
check("live: /logout keeps a safe next", !!lg.location && new URL(lg.location, ADMIN).searchParams.get("next") === "/invite/tok", lg);

console.log(fails === 0 ? "PASS SEC-003 (all checks)" : `FAIL SEC-003 (${fails} failing)`);
process.exitCode = fails === 0 ? 0 : 1;
