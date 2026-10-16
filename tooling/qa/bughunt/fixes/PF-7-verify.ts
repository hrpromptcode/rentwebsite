/**
 * PF-7 (web_visual follow-up SS-10): the bare /favicon.ico request must not 404. apps/web/public/favicon.ico is a
 * neutral default icon; the proxy matcher skips favicon.ico / *.ico for every host, so platform, tenant and unknown
 * hosts all get the same static file (no tenant resolution, no rewrite). Pages keep declaring their own
 * <link rel="icon"> (tenant favicon or the generated initial), so the default never replaces a tenant's icon.
 * Run from tooling/:  npx tsx qa/bughunt/fixes/PF-7-verify.ts
 */
import http from "node:http";

let failures = 0;
const check = (name: string, ok: boolean, info = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
};

function get(host: string, path: string, method = "GET"): Promise<{ status: number; type: string; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: 3000, path, method, headers: { host } }, (res) => {
      const parts: Buffer[] = [];
      res.on("data", (c: Buffer) => parts.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, type: String(res.headers["content-type"] ?? ""), body: Buffer.concat(parts) }));
    });
    req.on("error", reject);
    req.end();
  });
}
async function getRetry(host: string, path: string, method = "GET") {
  let r = await get(host, path, method);
  for (let i = 0; i < 2 && r.status >= 500; i++) {
    await new Promise((res) => setTimeout(res, 10_000));
    r = await get(host, path, method);
  }
  return r;
}

const isIco = (b: Buffer) => b.length > 22 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 && b.readUInt16LE(4) >= 1;

for (const host of ["localhost:3000", "demo-shop.localhost:3000", "demo-clinic.localhost:3000", "no-such-shop.localhost:3000"]) {
  const r = await getRetry(host, "/favicon.ico");
  check(`GET /favicon.ico on ${host} → 200 image/x-icon (valid ICO)`, r.status === 200 && /icon/.test(r.type) && isIco(r.body), `${r.status} ${r.type} ${r.body.length} B`);
}
const head = await getRetry("demo-shop.localhost:3000", "/favicon.ico", "HEAD");
check("HEAD /favicon.ico → 200", head.status === 200, String(head.status));

const page = await getRetry("demo-shop.localhost:3000", "/");
const links = [...page.body.toString("utf8").matchAll(/<link[^>]+rel="(?:shortcut )?icon"[^>]*>/g)].map((m) => m[0]);
check("tenant pages still declare their own icon (not the platform default)", page.status === 200 && links.length > 0 && links.every((l) => !/href="\/favicon\.ico/.test(l)), `${links.length} icon link(s)`);

console.log(failures ? `FAIL (${failures})` : "PASS all");
process.exit(failures ? 1 : 0);
