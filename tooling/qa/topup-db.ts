import "../load-env";
import { and, eq, gt, getAdminDb, tenants, games, gamePackages, codeStock, topupOrders, customers, wallets, sql } from "@rentweb/db";
/** Read-only snapshot of the demo-topup tenant for QA: tsx qa/topup-db.ts */
async function main() {
  const db = getAdminDb();
  const [t] = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants).where(eq(tenants.slug, "demo-topup")).limit(1);
  if (!t) { console.log("NO demo-topup tenant"); process.exit(1); }
  const pkgs = await db
    .select({ game: games.slug, name: gamePackages.name, price: gamePackages.price, fulfillment: gamePackages.fulfillment, id: gamePackages.id, active: gamePackages.active })
    .from(gamePackages).innerJoin(games, eq(games.id, gamePackages.gameId))
    .where(and(eq(gamePackages.tenantId, t.id), sql`${games.slug} in ('rov','steam-wallet','roblox')`))
    .orderBy(games.slug, gamePackages.sort);
  const stock = await db
    .select({ packageId: codeStock.packageId, status: codeStock.status, n: sql<number>`count(*)` })
    .from(codeStock).where(eq(codeStock.tenantId, t.id)).groupBy(codeStock.packageId, codeStock.status);
  const [recent] = await db.select({ n: sql<number>`count(*)` }).from(topupOrders)
    .where(and(eq(topupOrders.tenantId, t.id), gt(topupOrders.placedAt, new Date(Date.now() - 3600_000))));
  const [orders] = await db.select({ n: sql<number>`count(*)`, last: sql<string>`max(number)` }).from(topupOrders).where(eq(topupOrders.tenantId, t.id));
  const [cust] = await db.select({ n: sql<number>`count(*)` }).from(customers).where(eq(customers.tenantId, t.id));
  const [wal] = await db.select({ n: sql<number>`count(*)` }).from(wallets).where(eq(wallets.tenantId, t.id));
  console.log(JSON.stringify({ tenantId: t.id, ordersTotal: orders, ordersLastHour: Number(recent?.n ?? 0), customers: Number(cust?.n), wallets: Number(wal?.n) }));
  for (const p of pkgs) {
    const s = stock.filter((x) => x.packageId === p.id).map((x) => `${x.status}=${x.n}`).join(",");
    console.log(`${p.game.padEnd(13)} ${p.name.padEnd(14)} ${String(p.price).padStart(6)} ${p.fulfillment.padEnd(7)} ${p.active ? "active" : "OFF"} ${p.id}${s ? "  stock:" + s : ""}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
