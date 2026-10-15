import "./load-env";
import { eq, getAdminDb, walletTopups, topupOrders } from "@rentweb/db";
// usage: tsx _topup-pay.ts wallet <walletTopupId> | order <number>
async function main() {
  const [kind, id] = process.argv.slice(2);
  const db = getAdminDb();
  if (kind === "wallet") {
    const [r] = await db.select({ paymentId: walletTopups.paymentId, status: walletTopups.status }).from(walletTopups).where(eq(walletTopups.id, id!)).limit(1);
    console.log(r?.paymentId ?? "");
  } else {
    const [r] = await db.select({ paymentId: topupOrders.paymentId, status: topupOrders.status }).from(topupOrders).where(eq(topupOrders.number, id!)).limit(1);
    console.log(r?.paymentId ?? "");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
