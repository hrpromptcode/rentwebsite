import "../../load-env";
import "../../../apps/web/src/modules";
import { and, eq, sql, customers, getDb, getAdminDb, topupOrders, payments, withTenant } from "@rentweb/db";
import { upsertGuestCustomer } from "../../../packages/core/src/customer";
import { cancelPayment, expireStalePayments, getPayment, paymentHookSummary } from "../../../packages/core/src/payments";
import { createTopupOrder, getGameBySlug } from "../../../packages/modules/topup/src/services";

/** Service-level probes for the topup storefront bughunt (demo-topup). Run from tooling/: pnpm exec tsx qa/bughunt/topup_storefront-svc.ts */
const T = "01a1401c-b9af-71d6-8837-f2f2f33a2579";
const rows = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? []));
const out: string[] = [];
const log = (s: string) => { console.log(s); out.push(s); };

async function main() {
  const admin = getAdminDb();
  const db = getDb();
  const [tenant] = rows(await admin.execute(sql`select settings from tenants where id = ${T}`)) as Array<{ settings: Record<string, unknown> }>;
  const settings = tenant!.settings;
  const rov = await withTenant(db, T, (tx) => getGameBySlug(tx, T, "rov"));
  const pkg = rov!.packages[0]!;
  log(`rov pkg ${pkg.id} ${pkg.name} ${pkg.price} ${pkg.fulfillment}`);

  /* S0 hook summary */
  const hooks = paymentHookSummary() as unknown;
  log(`S0 paymentHookSummary: ${JSON.stringify(hooks)}`);

  const FROM = Number(process.argv[2] ?? 1);
  const [existing] = rows(await admin.execute(sql`select id, phone, name from customers where tenant_id = ${T} and phone = '0812345678'`)) as Array<{ id: string; phone: string; name: string }>;
  if (FROM <= 2) {
  /* S1 guest order with an EXISTING customer's phone (OTP gate off in config) → attached to that customer? */
  const before = rows(await admin.execute(sql`select count(*)::int as n from topup_orders where tenant_id = ${T} and customer_id = ${existing!.id}`)) as Array<{ n: number }>;
  const r1 = await withTenant(db, T, (tx) =>
    createTopupOrder(tx, T, { gameSlug: "rov", packageId: pkg.id, playerFields: { uid: "555000111" }, paymentMethod: "promptpay_qr", contact: "081-234-5678", customer: null, ip: null, settings, config: { otpRequiredFirstOrder: false } }),
  );
  if (r1.ok) {
    log(`S1 guest order ${r1.value.order.number} created; order.customer_id=${r1.value.order.customerId} existing(0812345678).id=${existing!.id} name=${existing!.name} → ${r1.value.order.customerId === existing!.id ? "ATTACHED TO EXISTING CUSTOMER (merge)" : "separate"}; orders of that customer before=${before[0]!.n}`);
  } else log(`S1 guest order refused: ${r1.error} ${r1.code}`);

  /* S2 blocked customer ordering as guest with the same phone (OTP gate off) */
  const phoneB = "0868000001";
  const blocked = await withTenant(db, T, (tx) => upsertGuestCustomer(tx, T, { phone: phoneB, name: "QA blocked" }));
  await admin.execute(sql`update customers set blocked_at = now() where tenant_id = ${T} and id = ${blocked!.id}`);
  const r2 = await withTenant(db, T, (tx) =>
    createTopupOrder(tx, T, { gameSlug: "rov", packageId: pkg.id, playerFields: { uid: "555000222" }, paymentMethod: "promptpay_qr", contact: phoneB, customer: null, ip: null, settings, config: { otpRequiredFirstOrder: false } }),
  );
  log(r2.ok ? `S2 BLOCKED customer (blocked_at set, phone ${phoneB}) could order as guest: ${r2.value.order.number} customer_id=${r2.value.order.customerId} (== blocked ${blocked!.id}: ${r2.value.order.customerId === blocked!.id})` : `S2 blocked guest refused: ${r2.error} ${r2.code}`);
  /* also: blocked customer passed as signed-in (defence in depth) */
  const r2b = await withTenant(db, T, (tx) =>
    createTopupOrder(tx, T, { gameSlug: "rov", packageId: pkg.id, playerFields: { uid: "555000223" }, paymentMethod: "promptpay_qr", contact: phoneB, customer: { id: blocked!.id, tier: "member" }, ip: null, settings, config: { otpRequiredFirstOrder: true } }),
  );
  log(r2b.ok ? `S2b createTopupOrder with customer={blocked id} accepted: ${r2b.value.order.number}` : `S2b refused: ${r2b.error} ${r2b.code}`);
  await admin.execute(sql`update customers set blocked_at = null where tenant_id = ${T} and id = ${blocked!.id}`);

  }
  /* S3 OTP gate: guest refused — but is a customer row created anyway? */
  const phoneC = "0868000003";
  const c0 = rows(await admin.execute(sql`select count(*)::int as n from customers where tenant_id = ${T} and phone = ${phoneC}`)) as Array<{ n: number }>;
  const r3 = await withTenant(db, T, (tx) =>
    createTopupOrder(tx, T, { gameSlug: "rov", packageId: pkg.id, playerFields: { uid: "555000333" }, paymentMethod: "promptpay_qr", contact: phoneC, customer: null, ip: null, settings, config: { otpRequiredFirstOrder: true } }),
  );
  const c1 = rows(await admin.execute(sql`select count(*)::int as n, max(id::text) as id from customers where tenant_id = ${T} and phone = ${phoneC}`)) as Array<{ n: number; id: string }>;
  log(`S3 otp gate: result ${r3.ok ? "ok " + r3.value.order.number : r3.code}; customers with phone ${phoneC} before=${c0[0]!.n} after=${c1[0]!.n} (${c1[0]!.id})`);

  /* S4 expiry sweep + cancelPayment on a pending topup payment */
  const r4 = await withTenant(db, T, (tx) =>
    createTopupOrder(tx, T, { gameSlug: "rov", packageId: pkg.id, playerFields: { uid: "555000444" }, paymentMethod: "promptpay_qr", contact: "081-234-5678", customer: { id: existing!.id, tier: "member" }, ip: null, settings, config: { otpRequiredFirstOrder: true } }),
  );
  if (r4.ok && r4.value.payment) {
    const pid = r4.value.payment.id;
    await admin.execute(sql`update payments set expires_at = now() - interval '2 hours' where tenant_id = ${T} and id = ${pid}`);
    const swept = await expireStalePayments(db as any, { graceMinutes: 0 } as any).catch((e: Error) => `threw ${e.message}`);
    const [p4] = rows(await admin.execute(sql`select status, expires_at from payments where id = ${pid}`)) as Array<{ status: string }>;
    const [o4] = rows(await admin.execute(sql`select status from topup_orders where id = ${r4.value.order.id}`)) as Array<{ status: string }>;
    log(`S4 sweep: order ${r4.value.order.number} payment expired 2h ago; expireStalePayments → ${JSON.stringify(swept)}; payment.status=${p4!.status} order.status=${o4!.status}`);
    const cancelled = await withTenant(db, T, (tx) => cancelPayment(tx, T, pid, "qa cancel", {} as any)).catch((e: Error) => `threw ${e.message}`);
    const [o4b] = rows(await admin.execute(sql`select status from topup_orders where id = ${r4.value.order.id}`)) as Array<{ status: string }>;
    log(`S4b cancelPayment(runHandler default) → ${typeof cancelled === "string" ? cancelled : (cancelled as { status: string }).status}; order.status after=${o4b!.status}`);
  } else log(`S4 could not create order: ${r4.ok ? "no payment" : r4.code}`);

  /* S5 refundRequired flag on payments of failed slip-paid orders (existing data) */
  const f = rows(await admin.execute(sql`select o.number, o.status, o.payment_method, o.supplier_response->>'refundRequired' as order_rr, p.status as pstatus, p.provider_payload->'refundRequired' as pay_rr, p.failure_reason from topup_orders o join payments p on p.id = o.payment_id where o.tenant_id = ${T} and o.status in ('failed') order by o.placed_at desc limit 5`));
  log(`S5 failed orders vs payment refundRequired: ${JSON.stringify(f)}`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
