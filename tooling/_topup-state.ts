import "./load-env";
import { eq, getAdminDb, tenants, walletTopups, walletTransactions, wallets, topupOrders, codeStock, sql } from "@rentweb/db";
async function main() {
  const db = getAdminDb();
  const tid: string = (await getAdminDb().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, "demo-topup")).limit(1))[0]?.id ?? (() => { throw new Error("tenant demo-topup not found — run reset-demo --template topup"); })();
  const wt = await db.select({ id: walletTopups.id, status: walletTopups.status, amount: walletTopups.amount, bonus: walletTopups.bonus, paymentId: walletTopups.paymentId }).from(walletTopups).where(eq(walletTopups.tenantId, tid));
  const w = await db.select({ id: wallets.id, balance: wallets.balance }).from(wallets).where(eq(wallets.tenantId, tid));
  const tx = await db.select({ type: walletTransactions.type, amount: walletTransactions.amount, reason: walletTransactions.reason, balanceAfter: walletTransactions.balanceAfter, key: walletTransactions.idempotencyKey }).from(walletTransactions).where(eq(walletTransactions.tenantId, tid));
  const o = await db.select({ number: topupOrders.number, status: topupOrders.status, method: topupOrders.paymentMethod, fulfillment: topupOrders.fulfillment, supplierRef: topupOrders.supplierRef, reason: topupOrders.failureReason }).from(topupOrders).where(eq(topupOrders.tenantId, tid));
  const [cs] = await db.select({ avail: sql<number>`count(*) filter (where status='available')`, sold: sql<number>`count(*) filter (where status='sold')` }).from(codeStock).where(eq(codeStock.tenantId, tid));
  console.log(JSON.stringify({ walletTopups: wt, wallets: w, transactions: tx, orders: o, codeStock: cs }, null, 1));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
