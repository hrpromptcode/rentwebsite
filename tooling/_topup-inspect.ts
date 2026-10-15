import "./load-env";
import { eq, getAdminDb, tenants, games, gamePackages, codeStock, topupBlacklist, topupOrders, customers, wallets, sql } from "@rentweb/db";
async function main() {
  const db = getAdminDb();
  const [t] = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants).where(eq(tenants.slug, "demo-topup")).limit(1);
  if (!t) { console.log("NO demo-topup tenant"); process.exit(0); }
  const cnt = async (tbl: any) => Number((await db.select({ n: sql<number>`count(*)` }).from(tbl).where(eq(tbl.tenantId, t.id)))[0]!.n);
  console.log(JSON.stringify({ tenantId: t.id, games: await cnt(games), packages: await cnt(gamePackages), codeStock: await cnt(codeStock), blacklist: await cnt(topupBlacklist), orders: await cnt(topupOrders), customers: await cnt(customers), wallets: await cnt(wallets) }));
  const custs = await db.select({ id: customers.id, phone: customers.phone, tier: customers.tier, name: customers.name }).from(customers).where(eq(customers.tenantId, t.id)).limit(5);
  console.log("customers:", JSON.stringify(custs));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
