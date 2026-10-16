/** SBR-008 + SEC-004 regression: proxy matcher escapes the dot and /rw/* is always guarded.
 *   cd tooling && npx tsx qa/bughunt/fixes/SBR-008-verify.ts   (needs the dev server on :3000; prints PASS/FAIL) */
import { readFileSync } from "node:fs";
import http from "node:http";

let fail = 0;
const check = (ok: boolean, label: string) => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
};

// 1) static: the catch-all matcher, as the runtime string, used as a regex the way Next compiles "/(<re>)"
const src = readFileSync(new URL("../../../../apps/web/src/proxy.ts", import.meta.url), "utf8");
const literals = [...src.matchAll(/^\s*("\/[^"\n]*"),?\s*$/gm)].map((m) => JSON.parse(m[1]!) as string);
check(literals.includes("/rw/:path*"), "matcher has a dedicated /rw/:path* entry");
const catchAll = literals.find((l) => l.startsWith("/((?!"));
check(!!catchAll, "catch-all matcher found");
const re = new RegExp("^" + catchAll!.replace(/^\/\(/, "/(") + "$");
for (const p of ["/services/pico", "/services/xmap", "/products/nodejs", "/roadmap", "/about", "/"]) check(re.test(p), `proxy runs for ${p}`);
for (const p of ["/logo.png", "/a/b/app.js", "/x.map", "/font.woff2", "/_next/static/x", "/uploads/t/a.jpg", "/favicon.ico"]) check(!re.test(p), `proxy skipped for ${p}`);

// 2) live: via the dev server
function get(host: string, path: string): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: 3000, path, headers: { host } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers }));
    });
    r.on("error", reject);
    r.end();
  });
}
const title = (b: string) => b.match(/<title>([^<]*)/)?.[1] ?? "";
const pico = await get("demo-clinic.localhost:3000", "/services/pico");
check(pico.status === 200 && /pico/i.test(title(pico.body)), `demo-clinic /services/pico -> ${pico.status} "${title(pico.body)}"`);
const home = await get("demo-shop.localhost:3000", "/");
const id = String(home.headers["x-tenant-id"] ?? "");
check(!!id, `tenant id header on demo-shop (${id})`);
for (const p of [`/rw/${id}/x.png`, `/rw/${id}/about`, `/rw/${id}/logo.svg`, `/%72w/${id}/x.png`, "/rw"]) {
  const r = await get("localhost:3000", p);
  check(r.status === 404 && !/<title>/i.test(r.body), `direct ${p} -> ${r.status} without tenant layout`);
}
console.log(fail ? `FAIL ${fail} check(s)` : "PASS all");
process.exit(fail ? 1 : 0);
