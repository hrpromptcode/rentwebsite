/**
 * One-off, idempotent data fix for the top-up ADMIN packet (tooling/qa/bughunt/fixes/topup_admin.md):
 *  - ADMIN-06: gives every pre-0010 code_stock row its code_hash (decrypting it), voiding unsold duplicates that the old
 *    import created (backfillStockCodeHashes – the import also does this lazily per tenant);
 *  - ADMIN-13: proof images stored with the admin host prefix ("http://localhost:3001/uploads/…", which the admin never
 *    served) are rewritten to the relative "/uploads/…" path the storefront serves and the admin renders via assetUrl().
 *   cd tooling && MSYS_NO_PATHCONV=1 node_modules/.bin/tsx qa/bughunt/fixes/topup_admin-datafix.ts [--dry]
 */
import "../../../load-env";
import { getDb, sql, withPlatform, withTenant } from "@rentweb/db";
import { backfillStockCodeHashes } from "../../../../packages/modules/topup/src/admin/catalog";

const dry = process.argv.includes("--dry");
const db = getDb();
const rows = <R>(r: unknown) => (Array.isArray(r) ? r : ((r as { rows: unknown[] }).rows ?? [])) as R[];

const tenants = await withPlatform(db, async (tx) => rows<{ tenant_id: string; n: number }>(await tx.execute(sql`select tenant_id, count(*)::int n from code_stock where code_hash is null group by tenant_id`)));
for (const t of tenants) {
  if (dry) {
    console.log(`DRY tenant ${t.tenant_id}: ${t.n} rows without code_hash`);
    continue;
  }
  const r = await withTenant(db, t.tenant_id, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`code_stock:${t.tenant_id}`}))`);
    return backfillStockCodeHashes(tx, t.tenant_id);
  });
  console.log(`tenant ${t.tenant_id}: ${JSON.stringify(r)}`);
}
if (!tenants.length) console.log("code_stock: every row already has a code_hash");

const proofs = await withPlatform(db, async (tx) =>
  rows<{ id: string; tenant_id: string; number: string; proof_image: string }>(await tx.execute(sql`select id, tenant_id, number, proof_image from topup_orders where proof_image ~ '^https?://[^/]+/uploads/'`)),
);
for (const p of proofs) {
  const rel = p.proof_image.replace(/^https?:\/\/[^/]+(\/uploads\/)/, "$1");
  console.log(`${dry ? "DRY " : ""}${p.number}: ${p.proof_image} -> ${rel}`);
  if (!dry) await withTenant(db, p.tenant_id, (tx) => tx.execute(sql`update topup_orders set proof_image = ${rel} where tenant_id = ${p.tenant_id} and id = ${p.id}`));
}
if (!proofs.length) console.log("topup_orders.proof_image: no absolute /uploads URLs left");
const games = await withPlatform(db, async (tx) => rows<{ n: number }>(await tx.execute(sql`select count(*)::int n from games where image ~ '^https?://localhost:3001/uploads/' or banner ~ '^https?://localhost:3001/uploads/'`)));
console.log(`games with admin-host upload URLs: ${games[0]?.n ?? 0}`);
process.exit(0);
