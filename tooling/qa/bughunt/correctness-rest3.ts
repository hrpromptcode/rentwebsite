/** correctness bughunt – several guests scan the same table QR at the same moment → how many open sessions? */
import { done, tenantIdOf, tt } from "./correctness-lib";
import { and, eq, inArray, diningTables, tableSessions } from "@rentweb/db";
import { openOrGetSession } from "../../../packages/modules/restaurant/src/services/index";
async function main() {
  const t = await tenantIdOf("demo-restaurant");
  const tag = Date.now().toString(36).toUpperCase().slice(-4);
  const [table] = await tt(t, (tx) => tx.insert(diningTables).values({ tenantId: t, name: `QA-COR-S ${tag}`, qrToken: `qacs${tag.toLowerCase()}${Math.random().toString(36).slice(2, 8)}`, seats: 4 }).returning());
  await Promise.all(Array.from({ length: 8 }, () => tt(t, (tx) => tx.select({ id: diningTables.id }).from(diningTables).limit(1))));
  const res = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(() => tt(t, (tx) => openOrGetSession(tx, t, table!.id))));
  const open = await tt(t, (tx) => tx.select({ id: tableSessions.id, token: tableSessions.token }).from(tableSessions).where(and(eq(tableSessions.tenantId, t), eq(tableSessions.tableId, table!.id), inArray(tableSessions.status, ["open", "bill_requested"]))));
  console.log("8 parallel QR scans → created flags", JSON.stringify(res.map((r) => r.created)), "open sessions for table", table!.name, ":", JSON.stringify(open));
  // reverify-repro 2026-10-17: retire the probe table so it does not show up in the demo's public reserve form / capacity
  await tt(t, (tx) => tx.update(diningTables).set({ active: false }).where(and(eq(diningTables.tenantId, t), eq(diningTables.id, table!.id))));
  console.log(open.length === 1 && res.filter((r) => r.created).length <= 1 && new Set(res.map((r) => r.session.id)).size === 1 ? "PASS COR-26 8 parallel scans -> one open session" : "FAIL COR-26 bug reproduces");
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
