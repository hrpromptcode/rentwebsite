import "../../load-env";
import { sql, getAdminDb } from "@rentweb/db";
import "../../../apps/web/src/modules";
import { paymentHookSummary } from "@rentweb/core/payments";

/** Ad-hoc read-only probes for the topup_admin bughunt. MSYS_NO_PATHCONV=1 pnpm --filter @rentweb/tooling exec tsx qa/bughunt/topup_admin-db.ts [name] */
const T = "01a1401c-b9af-71d6-8837-f2f2f33a2579";
const rows = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? []));
const which = process.argv[2] ?? "all";

async function main() {
  const db = getAdminDb();
  const q = async (label: string, s: ReturnType<typeof sql>) => {
    console.log(`--- ${label} ---`);
    console.table(rows(await db.execute(s)));
  };
  if (which === "all" || which === "hooks") console.log("paymentHookSummary", JSON.stringify(paymentHookSummary()));
  if (which === "all" || which === "team") await q("demo-topup members", sql`select u.email, m.role from tenant_members m join "user" u on u.id = m.user_id where m.tenant_id = ${T} order by m.role`);
  if (which === "all" || which === "stale") {
    await q("pending_payment topup orders by age", sql`select count(*)::int n, min(placed_at) oldest, max(placed_at) newest from topup_orders where tenant_id = ${T} and status = 'pending_payment'`);
    await q("open topup/wallet_topup payments past expires_at", sql`select ref_type, status, count(*)::int n, min(expires_at) oldest_expiry from payments where tenant_id = ${T} and ref_type in ('topup','wallet_topup') and status in ('pending','pending_verification') and expires_at < now() - interval '15 minutes' group by 1,2`);
    await q("expired/cancelled counts for topup refTypes", sql`select ref_type, status, count(*)::int n from payments where tenant_id = ${T} and ref_type in ('topup','wallet_topup') group by 1,2 order by 1,2`);
  }
  if (which === "all" || which === "tenants") await q("topup tenants", sql`select id, slug, status, template_key, created_at from tenants where template_key = 'topup' or slug like '%topup%' order by created_at desc limit 10`);
  if (which === "all" || which === "stock") await q("code_stock dup check (same masked tail per package)", sql`select package_id, status, count(*)::int n from code_stock where tenant_id = ${T} group by 1,2 order by 1,2`);
  if (which === "events") await q("recent payment events", sql`select type, payload->>'paymentId' pid, payload->>'reason' reason, created_at from events_outbox where tenant_id = ${T} and type like 'payment.%' order by created_at desc limit 15`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
