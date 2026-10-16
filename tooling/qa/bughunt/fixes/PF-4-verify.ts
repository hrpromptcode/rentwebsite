// PF-4 (payments follow-up "db"): the cross-tenant expiry sweep (expireStalePayments: status='pending' and expires_at due)
// has an index on payments (status, expires_at). Checks the live DB definition and that the planner can use it.
// Run from tooling/:  npx tsx qa/bughunt/fixes/PF-4-verify.ts
// @ts-expect-error plain .mjs helper
import { db } from "../security-http.mjs";
const sql = db();
const [idx] = await sql`select indexdef from pg_indexes where tablename='payments' and indexname='payments_status_expires_idx'`;
const ok1 = !!idx && /\(status, expires_at\)/.test(idx.indexdef);
console.log(`${ok1 ? "PASS" : "FAIL"} index present: ${idx?.indexdef ?? "missing"}`);
const plan = await sql.begin(async (tx) => {
  await tx`set local enable_seqscan = off`;
  return tx`explain select id from payments where status = 'pending' and expires_at is not null and expires_at <= now() - interval '15 minutes' and ref_type in ('order','booking')`;
});
const text = plan.map((r: Record<string, string>) => Object.values(r)[0]).join("\n");
const ok2 = text.includes("payments_status_expires_idx");
console.log(`${ok2 ? "PASS" : "FAIL"} sweep query plan uses the index\n${text}`);
await sql.end();
process.exit(ok1 && ok2 ? 0 : 1);
