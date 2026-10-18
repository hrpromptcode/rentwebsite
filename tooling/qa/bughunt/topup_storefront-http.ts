import "../../load-env";
import http from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { sql, getAdminDb } from "@rentweb/db";
/**
 * HTTP-level probes for the demo-topup storefront (no browser): cross-tenant 404s, API gating, feed/stock edge cases,
 * link crawl. Node cannot resolve *.localhost reliably, so we hit 127.0.0.1:3000 with a Host header.
 *   cd tooling && MSYS_NO_PATHCONV=1 pnpm exec tsx qa/bughunt/topup_storefront-http.ts
 */
const T = "01a1401c-b9af-71d6-8837-f2f2f33a2579";
const TOPUP = "demo-topup.localhost";
const OUT = "qa/bughunt/topup_storefront-http.log";
const lines: string[] = [];
const log = (s: string) => {
  lines.push(s);
  console.log(s);
};

type Res = { status: number; headers: http.IncomingHttpHeaders; body: string; ms: number };
function req(host: string, path: string, opts: { method?: string; headers?: Record<string, string>; body?: Buffer | string } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const r = http.request({ host: "127.0.0.1", port: 3000, path, method: opts.method ?? "GET", headers: { Host: host, ...(opts.headers ?? {}) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8"), ms: Date.now() - t0 }));
    });
    r.setTimeout(120_000, () => {
      r.destroy(new Error("timeout"));
    });
    r.on("error", reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}
const pass: string[] = [];
const fail: string[] = [];
function check(name: string, cond: boolean, detail: string) {
  (cond ? pass : fail).push(name);
  log(`${cond ? "PASS" : "FAIL"}  ${name} — ${detail}`);
}

async function main() {
  const j = JSON.parse(readFileSync("qa/topup-journey-results.json", "utf8"));
  const stock = j.orders.stockOrder as { number: string; k: string; packageId: string };
  const apiO = j.orders.apiOrder as { number: string; k: string };
  const db = getAdminDb();
  const rows = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? [])) as Record<string, string>[];
  const [ord] = rows(await db.execute(sql`select payment_id, contact from topup_orders where tenant_id = ${T} and number = ${stock.number}`));
  const payId = ord!.payment_id;
  const [roblox] = rows(await db.execute(sql`select p.id from game_packages p join games g on g.id = p.game_id where p.tenant_id = ${T} and g.slug = 'roblox' order by p.sort limit 1`));
  log(`stock order ${stock.number} payment ${payId}; roblox pkg ${roblox!.id}`);
  const K = encodeURIComponent(stock.k);

  /* ---------- 1. cross-tenant host: everything top-up must be 404 on demo-shop (no topup module) and on an unknown host */
  const xt = ["/games", "/games/rov", `/topup/${stock.number}`, `/topup/${stock.number}?k=${K}`, "/topup/status", `/topup/status?number=${stock.number}`, "/wallet", "/account/topups", "/api/topup/feed", `/api/topup/orders/${stock.number}?k=${K}`, `/api/topup/stock/${stock.packageId}`, `/api/payments/${payId}?k=${K}`];
  for (const host of ["demo-shop.localhost", "nope-tenant.localhost"]) {
    for (const p of xt) {
      const r = await req(host, p);
      const leak = r.body.includes(stock.number) || r.body.includes("STEAM-") || r.body.includes("qa-steam@example.com");
      const okStatus = host === "demo-shop.localhost" && (p === "/games" || p === "/wallet") ? [200, 404, 307].includes(r.status) : [404, 307].includes(r.status);
      check(`xtenant ${host} ${p}`, okStatus && !leak && r.status !== 500, `status ${r.status}${leak ? " LEAK" : ""} ${r.ms}ms loc=${r.headers.location ?? "-"}`);
    }
  }

  /* ---------- 2. order status API gating */
  const noKey = await req(TOPUP, `/api/topup/orders/${stock.number}`);
  const nk = JSON.parse(noKey.body);
  check("api no key: authorised false, masked, no PII", noKey.status === 200 && nk.authorised === false && /\*{4}$/.test(nk.player) && !noKey.body.includes("qa-steam@example.com") && !noKey.body.includes("0891234567") && !/contact|deviceId|code/i.test(Object.keys(nk).join(",")), `${noKey.status} ${JSON.stringify(nk).slice(0, 200)}`);
  const wrong = await req(TOPUP, `/api/topup/orders/${stock.number}?k=${encodeURIComponent(stock.k.slice(0, -1) + "x")}`);
  check("api wrong key: authorised false", JSON.parse(wrong.body).authorised === false, wrong.body.slice(0, 120));
  const otherKey = await req(TOPUP, `/api/topup/orders/${stock.number}?k=${encodeURIComponent(apiO.k)}`);
  check("api key of another order: authorised false", JSON.parse(otherKey.body).authorised === false, otherKey.body.slice(0, 120));
  const good = await req(TOPUP, `/api/topup/orders/${stock.number.toLowerCase()}?k=${K}`);
  const g = JSON.parse(good.body);
  check("api right key (lowercase number): authorised true, still masked, no code", good.status === 200 && g.authorised === true && /\*{4}$/.test(g.player) && !good.body.includes("STEAM-") && !good.body.includes("qa-steam@example.com"), `${good.status} ${good.body.slice(0, 200)}`);
  check("api cache-control no-store", /no-store/.test(String(good.headers["cache-control"])), String(good.headers["cache-control"]));
  for (const bad of ["TP-999999", "TP-1040%27--", "TP-1040%00", "x".repeat(300), "%E0%B8%97%E0%B8%94", "TP-1040%2F..%2FTP-1039"]) {
    const r = await req(TOPUP, `/api/topup/orders/${bad}`);
    check(`api bad number ${bad.slice(0, 20)}: 404 (not 500)`, r.status === 404, `status ${r.status} ${r.body.slice(0, 80)}`);
  }
  const post = await req(TOPUP, `/api/topup/orders/${stock.number}`, { method: "POST" });
  check("api POST order status: 405", post.status === 405, `status ${post.status}`);

  /* ---------- 3. stock API */
  for (const [id, exp] of [
    ["abc", 404],
    ["00000000-0000-4000-8000-000000000000", 404],
    [roblox!.id, 200],
    [stock.packageId, 200],
  ] as const) {
    const r = await req(TOPUP, `/api/topup/stock/${id}`);
    let extra = "";
    if (r.status === 200) {
      const b = JSON.parse(r.body);
      extra = ` available=${b.available} inStock=${b.inStock}`;
      if (id === roblox!.id) check("stock roblox sold out: available 0 / inStock false", b.available === 0 && b.inStock === false, r.body);
    }
    check(`stock ${id.slice(0, 12)}: ${exp}`, r.status === exp, `status ${r.status}${extra}`);
  }

  /* ---------- 4. feed */
  for (const [q, max] of [
    ["limit=abc", 10],
    ["limit=-5", 1],
    ["limit=1e9", 30],
    ["limit=2.5", 3],
    ["limit=0", 10],
    ["", 10],
  ] as const) {
    const r = await req(TOPUP, `/api/topup/feed?${q}`);
    const items = r.status === 200 ? (JSON.parse(r.body).items as unknown[]) : null;
    const leak = /qa-steam@example\.com|STEAM-[A-Z0-9]{4}-|"contact"|deviceId|0891234567/.test(r.body);
    check(`feed ?${q}: 200, <=${max} items, no PII`, r.status === 200 && !!items && items.length <= max && !leak, `status ${r.status} items=${items?.length}${leak ? " LEAK" : ""}`);
  }
  const fp = await req(TOPUP, "/api/topup/feed", { method: "POST" });
  check("feed POST: 405", fp.status === 405, `status ${fp.status}`);

  /* ---------- 5. payments API with topup proof */
  const pNo = await req(TOPUP, `/api/payments/${payId}`);
  check("payments GET no proof: 404", pNo.status === 404, `status ${pNo.status} ${pNo.body.slice(0, 80)}`);
  const pKey = await req(TOPUP, `/api/payments/${payId}`, { headers: { "x-access-key": stock.k } });
  const pk = pKey.status === 200 ? JSON.parse(pKey.body) : {};
  check("payments GET x-access-key: 200 {id,status,amount} no refType/refId", pKey.status === 200 && pk.status === "paid" && !("refType" in pk) && !("refId" in pk), `status ${pKey.status} ${pKey.body.slice(0, 160)}`);
  const pQ = await req(TOPUP, `/api/payments/${payId}?k=${K}`);
  check("payments GET ?k=: 200", pQ.status === 200, `status ${pQ.status}`);
  const pWrong = await req(TOPUP, `/api/payments/${payId}?k=nope`);
  check("payments GET wrong key: 404", pWrong.status === 404, `status ${pWrong.status}`);
  const pBad = await req(TOPUP, `/api/payments/not-a-uuid`);
  check("payments GET non-uuid: 404", pBad.status === 404, `status ${pBad.status}`);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const boundary = "----qa" + Date.now();
  const mp = (fields: Record<string, string>, file: { name: string; type: string; data: Buffer }) =>
    Buffer.concat([
      ...Object.entries(fields).map(([k, v]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="slip"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`),
      file.data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
  const body = mp({ k: stock.k }, { name: "slip.png", type: "image/png", data: png });
  const sPaid = await req(TOPUP, `/api/payments/${payId}/slip`, { method: "POST", headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(body.length) }, body });
  check("slip onto paid payment: 200 status paid (no state change)", sPaid.status === 200 && JSON.parse(sPaid.body).status === "paid", `status ${sPaid.status} ${sPaid.body.slice(0, 120)}`);
  const body2 = mp({}, { name: "slip.png", type: "image/png", data: png });
  const sNo = await req(TOPUP, `/api/payments/${payId}/slip`, { method: "POST", headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(body2.length) }, body: body2 });
  check("slip without proof: 403/404 (never 200)", [403, 404].includes(sNo.status), `status ${sNo.status} ${sNo.body.slice(0, 120)}`);

  /* ---------- 6. page-level checks (HTML) */
  const pubPage = await req(TOPUP, `/topup/${stock.number}`);
  check("public order page: 200, no contact/code/raw player", pubPage.status === 200 && !pubPage.body.includes("qa-steam@example.com") && !pubPage.body.includes("0891234567") && !/STEAM-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/.test(pubPage.body), `status ${pubPage.status} len ${pubPage.body.length}`);
  const keyPage = await req(TOPUP, `/topup/${stock.number}?k=${K}`);
  check("keyed order page: 200 with contact + code reveal", keyPage.status === 200 && keyPage.body.includes("qa-steam@example.com") && keyPage.body.includes("แสดงโค้ด"), `status ${keyPage.status}`);
  const robots = /name="robots"[^>]*content="([^"]*)"/.exec(keyPage.body)?.[1] ?? /content="([^"]*)"[^>]*name="robots"/.exec(keyPage.body)?.[1];
  check("keyed order page noindex", /noindex/.test(robots ?? ""), `robots=${robots}`);
  for (const [p, exp] of [
    ["/games/does-not-exist", 404],
    ["/games/%E0%B8%97%E0%B8%94", 404],
    ["/games/rov?pkg=abc", 200],
    ["/topup/status?number=%3Cscript%3Ealert(1)%3C/script%3E", 200],
    ["/topup/status?number=" + "a".repeat(500), 200],
    ["/topup/TP-999999", 404],
    ["/wallet", 307],
    ["/account/topups", 307],
    ["/account/login?next=//evil.example", 200],
  ] as const) {
    const r = await req(TOPUP, p);
    const xss = p.includes("script") && r.body.includes("<script>alert(1)</script>");
    check(`page ${p.slice(0, 60)}: ${exp}`, r.status === exp && !xss, `status ${r.status}${xss ? " XSS" : ""} loc=${r.headers.location ?? "-"} ${r.ms}ms`);
  }

  /* ---------- 7. link crawl from /, /games, /how-to, /contact, /topup/status (internal links, GET, status < 400) */
  const seen = new Map<string, number>();
  const queue = ["/", "/games", "/how-to", "/contact", "/topup/status", "/account/login"];
  const hrefRe = /href="(\/[^"#?]*)(\?[^"#]*)?/g;
  while (queue.length && seen.size < 80) {
    const p = queue.shift()!;
    if (seen.has(p)) continue;
    const r = await req(TOPUP, p);
    seen.set(p, r.status);
    if (r.status >= 400) log(`  crawl ${r.status} ${p}`);
    if (r.status === 200 && /text\/html/.test(String(r.headers["content-type"]))) {
      let m: RegExpExecArray | null;
      while ((m = hrefRe.exec(r.body))) {
        const h = m[1]!;
        if (/^\/(_next|api|uploads)/.test(h) || /\.(png|jpg|svg|ico|webp|xml|txt)$/.test(h) || seen.has(h) || queue.includes(h)) continue;
        queue.push(h);
      }
    }
  }
  const bad = [...seen].filter(([, s]) => s >= 400);
  check(`link crawl: ${seen.size} internal URLs, none >=400`, bad.length === 0, bad.map(([p, s]) => `${s} ${p}`).join(", ") || [...seen.keys()].join(" "));

  log(`\n${pass.length} pass, ${fail.length} fail${fail.length ? ": " + fail.join(" | ") : ""}`);
  writeFileSync(OUT, lines.join("\n") + "\n");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  writeFileSync(OUT, lines.join("\n") + "\nCRASH " + String(e) + "\n");
  process.exit(1);
});
