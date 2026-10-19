/**
 * STOREFRONT-02 / -03 / -04 (top-up storefront API + status routes) against the running web dev server (:3000).
 *   tooling/node_modules/.bin/tsx tooling/qa/bughunt/fixes/STOREFRONT-02-03-04-verify.ts
 * Prints one PASS/FAIL line per check; exit code 1 when any check fails.
 */
import http from "node:http";

function get(host: string, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: 3000, path, method: "GET", headers: { host: `${host}:3000` }, timeout: 120_000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`timeout ${path}`)));
    req.end();
  });
}

let failed = 0;
function check(id: string, name: string, ok: boolean, detail: string) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${name} — ${detail}`);
}

const TOPUP = "demo-topup.localhost";
const SHOP = "demo-shop.localhost"; // tenant without the topup module

async function main() {
  // STOREFRONT-02: module gate on every /api/topup route
  for (const p of ["/api/topup/feed", "/api/topup/orders/TP-1040", "/api/topup/stock/00000000-0000-4000-8000-000000000000"]) {
    const r = await get(SHOP, p);
    check("STOREFRONT-02", `${SHOP}${p}`, r.status === 404, `status=${r.status} body=${r.body.slice(0, 40)}`);
  }
  const feed = await get(TOPUP, "/api/topup/feed");
  check("STOREFRONT-02", "demo-topup feed still served", feed.status === 200 && Array.isArray(JSON.parse(feed.body).items), `status=${feed.status}`);

  // STOREFRONT-03: NUL byte / garbage order numbers → 404 / ไม่พบรายการ, never 500
  for (const p of ["/api/topup/orders/TP-1040%00?k=x", "/api/topup/orders/%00", "/api/topup/orders/TP-1040'%20or%201=1", "/api/topup/orders/TP-99999999999"]) {
    const r = await get(TOPUP, p);
    check("STOREFRONT-03", p, r.status === 404, `status=${r.status}`);
  }
  for (const p of ["/topup/status?number=TP-1040%00", "/topup/status?number=%00%01", "/topup/status?number=a&number=b"]) {
    const r = await get(TOPUP, p);
    check("STOREFRONT-03", p, r.status === 200 && (r.body.includes("ไม่พบรายการ") || !r.body.includes("__next_error__")), `status=${r.status} notFoundCopy=${r.body.includes("ไม่พบรายการ")}`);
  }
  const page = await get(TOPUP, "/topup/TP-1040%00");
  check("STOREFRONT-03", "/topup/TP-1040%00", page.status === 404, `status=${page.status}`);
  const ok = await get(TOPUP, "/api/topup/orders/tp-1040");
  check("STOREFRONT-03", "lower-case valid number still found", ok.status === 200 && JSON.parse(ok.body).number === "TP-1040", `status=${ok.status}`);
  const st = await get(TOPUP, "/topup/status?number=tp-1040");
  check("STOREFRONT-03", "status page finds valid number", st.status === 200 && st.body.includes("ดูไทม์ไลน์รายการ"), `status=${st.status}`);

  // STOREFRONT-04: non-integer / garbage limits are rounded and clamped
  for (const [q, max] of [["2.5", 2], ["1.0", 1], ["-3", 10], ["abc", 10], ["1e9", 30], ["0", 10]] as const) {
    const r = await get(TOPUP, `/api/topup/feed?limit=${q}`);
    const n = r.status === 200 ? (JSON.parse(r.body).items as unknown[]).length : -1;
    check("STOREFRONT-04", `limit=${q}`, r.status === 200 && n <= max && n >= 0, `status=${r.status} items=${n} (≤${max})`);
  }
  console.log(failed ? `${failed} FAILED` : "ALL PASS");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("FAIL error", e);
  process.exit(1);
});
