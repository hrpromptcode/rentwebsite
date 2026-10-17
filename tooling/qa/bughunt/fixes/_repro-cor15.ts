/**
 * reverify-repro (COR-15): run the order.paid handler for the latest guest order.paid event inside a rolled-back
 * transaction, take the customer link it writes, and open that link on the storefront (must show the order, not
 * "ไม่พบคำสั่งซื้อ"). Run from tooling/: pnpm exec tsx qa/bughunt/fixes/_repro-cor15.ts
 */
import { done, hreq, plat } from "../correctness-lib";
import { sql } from "@rentweb/db";
import { HANDLERS } from "../../../../packages/integrations/src/events/handlers";
const rows = (x: any) => (Array.isArray(x) ? x : x.rows);
async function main() {
  let link = "";
  let host = "";
  await plat(async (tx) => {
    const [e] = rows(await tx.execute(sql`select e.id, e.tenant_id, e.type, e.payload, e.attempts, t.slug from events_outbox e join tenants t on t.id = e.tenant_id join orders o on o.id = (e.payload->>'orderId')::uuid where e.type='order.paid' and t.slug in ('demo-shop','demo-cafe','sec-u1shop') order by e.created_at desc limit 1`));
    if (!e) throw new Error("no order.paid event");
    host = `${e.slug}.localhost:3000`;
    console.log("event", e.id, e.slug, "payload keys", Object.keys(e.payload).join(","));
    await HANDLERS["order.paid"]!(tx, { id: e.id, tenantId: e.tenant_id, type: e.type, payload: e.payload, attempts: e.attempts });
    const n = rows(await tx.execute(sql`select channel, status, payload->>'link' link from notifications where tenant_id=${e.tenant_id} and template='order.paid' and created_at >= now() order by created_at desc limit 3`));
    console.log("notifications written:", JSON.stringify(n));
    link = n.find((r: any) => r.link)?.link ?? "";
    throw new Error("ROLLBACK (intentional)");
  }).catch((err) => { if (!String(err.message).startsWith("ROLLBACK")) throw err; });
  if (!link) { console.log("FAIL COR-15 handler wrote no customer link"); await done(); process.exit(1); }
  const u = new URL(link);
  const r = await hreq(host, u.pathname + u.search);
  const found = r.status === 200 && !r.body.includes("ไม่พบคำสั่งซื้อ");
  console.log("link", u.pathname + u.search.replace(/k=[^&]+/, "k=<key>"), "->", r.status);
  console.log(/[?&]k=/.test(u.search) && found ? "PASS COR-15 guest order.paid link carries the access key and opens the order" : "FAIL COR-15 bug reproduces");
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
