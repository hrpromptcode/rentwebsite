import "../../../load-env";
import "../../../../apps/web/src/modules";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, games, getAdminDb, getDb, sql, withTenant } from "@rentweb/db";
import { flagTopupPaymentRefund, safeFieldPattern, topupFailureText } from "../../../../packages/modules/topup/src/services";

/**
 * One-off, idempotent data fix (final top-up verification, 2026-10-19): orders that failed / were cancelled BEFORE the fix
 * wave while their payment was already `paid` only carried the refund flag on topup_orders.supplier_response (or none at
 * all, SERVICES-05 / STOREFRONT-09). Flag the payment exactly like the new code does (providerPayload.refundRequired +
 * failureReason "ต้องคืนเงิน: …" + payment.refund_required), so /payments shows ต้องคืนเงิน and the order page offers
 * "บันทึกว่าคืนเงินแล้ว" (RV-05 path). A paid payment already flagged is left alone.
 * Part 2 (STOREFRONT-12): demo-topup's game rows were seeded before the template got player-field formats, so the live
 * demo still accepted "ทดสอบ🙂" as a Genshin UID. Copy pattern / inputMode / hint / minLength / maxLength / placeholder
 * from packages/templates/src/topup.ts (parsed from the template's own `defs`) into the existing fields by key — labels,
 * options and anything the shop already set are kept.
 * Part 3 (ADMIN-17): the template's demo hero now says "และเกมยอดนิยมอีกมากมาย" instead of "และอีก 40+ เกม" (the demo has 8
 * games); demo-topup's home page (never edited since the seed) still had the old phrase in sections + published_sections.
 *   cd tooling && MSYS_NO_PATHCONV=1 node_modules/.bin/tsx qa/bughunt/fixes/topup_verify-datafix.ts [--dry]
 */
const dry = process.argv.includes("--dry");
const rowsOf = <T>(r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? [])) as T[];

async function main() {
  const admin = getAdminDb();
  const todo = rowsOf<{ tenant_id: string; number: string; status: string; payment_id: string; failure_reason: string | null }>(
    await admin.execute(sql`select o.tenant_id, o.number, o.status, o.payment_id, o.failure_reason
      from topup_orders o join payments p on p.id = o.payment_id and p.tenant_id = o.tenant_id
      where o.status in ('failed', 'cancelled') and p.status = 'paid' and not coalesce(p.provider_payload ? 'refundRequired', false)
      order by o.placed_at`),
  );
  console.log(`${todo.length} paid payment(s) of failed / cancelled orders without a refund flag${dry ? " (dry run)" : ""}`);
  for (const o of todo) {
    const reason = o.status === "cancelled" ? "รับเงินหลังยกเลิกรายการ" : topupFailureText(o.failure_reason ?? "") || "รายการเติมไม่สำเร็จ";
    if (dry) {
      console.log(`  would flag ${o.number} (${o.status}) payment ${o.payment_id}: ${reason}`);
      continue;
    }
    const flagged = await withTenant(getDb(), o.tenant_id, (tx) => flagTopupPaymentRefund(tx, o.tenant_id, o.payment_id, reason));
    console.log(`  ${o.number} (${o.status}) payment ${o.payment_id}: ${flagged ? "flagged" : "unchanged"} — ${reason}`);
  }

  /* part 2: player-field formats on demo-topup (STOREFRONT-12) */
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.resolve(here, "../../../../packages/templates/src/topup.ts"), "utf8");
  const from = src.indexOf("const defs = [");
  const to = src.indexOf("] as const;", from);
  if (from < 0 || to < 0) throw new Error("template defs not found");
  type Field = Record<string, unknown> & { key: string };
  const defs = new Function("u", `return ${src.slice(from + "const defs = ".length, to + 1)};`)(() => "") as Array<{ slug: string; fields: Field[] }>;
  const [tenant] = rowsOf<{ id: string }>(await admin.execute(sql`select id from tenants where slug = 'demo-topup'`));
  if (!tenant) throw new Error("no demo-topup");
  const COPY = ["pattern", "inputMode", "hint", "minLength", "maxLength", "placeholder"] as const;
  for (const d of defs) {
    await withTenant(getDb(), tenant.id, async (tx) => {
      const [g] = await tx.select({ id: games.id, fields: games.fields }).from(games).where(and(eq(games.tenantId, tenant.id), eq(games.slug, d.slug))).limit(1);
      if (!g) return console.log(`  game ${d.slug}: not on demo-topup`);
      const added: string[] = [];
      const next = ((g.fields ?? []) as Field[]).map((field) => {
        const t = d.fields.find((x) => x.key === field.key);
        if (!t) return field;
        const out: Field = { ...field };
        for (const k of COPY) {
          if (t[k] === undefined || out[k] !== undefined) continue;
          if (k === "pattern" && safeFieldPattern(String(t[k])) === null) throw new Error(`template pattern refused: ${d.slug}.${field.key}`);
          out[k] = t[k];
          added.push(`${field.key}.${k}`);
        }
        return out;
      });
      if (!added.length) return console.log(`  game ${d.slug}: already has the template formats`);
      if (!dry) await tx.update(games).set({ fields: next as typeof g.fields, updatedAt: new Date() }).where(and(eq(games.tenantId, tenant.id), eq(games.id, g.id)));
      console.log(`  game ${d.slug}: ${dry ? "would add" : "added"} ${added.join(", ")}`);
    });
  }

  /* part 3: demo hero copy (ADMIN-17) */
  const OLD = "และอีก 40+ เกม", NEW = "และเกมยอดนิยมอีกมากมาย";
  const pages = rowsOf<{ id: string; slug: string }>(
    await admin.execute(sql`select id, slug from pages where tenant_id = ${tenant.id} and (position(${OLD} in sections::text) > 0 or position(${OLD} in coalesce(published_sections::text, '')) > 0)`),
  );
  for (const p of pages) {
    if (!dry)
      await admin.execute(sql`update pages set sections = replace(sections::text, ${OLD}, ${NEW})::jsonb,
        published_sections = case when published_sections is null then null else replace(published_sections::text, ${OLD}, ${NEW})::jsonb end
        where tenant_id = ${tenant.id} and id = ${p.id}`);
    console.log(`  page ${p.slug}: ${dry ? "would replace" : "replaced"} "${OLD}" → "${NEW}"`);
  }
  if (!pages.length) console.log(`  pages: no "${OLD}" left`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
