/**
 * correctness bughunt – two outbox drainers at once (e.g. cron route + worker, or overlapping cron calls).
 * reverify-repro 2026-10-17: the original version inserted 40 no-op events 1 h old and drained with limit 100 twice;
 * on the shared dev DB the backlog (675 pending events, oldest 2026-10-16) sorts first, so the drainers claimed real
 * events instead of the probe (and processed them). Now: 80 no-op events dated 3 days back (older than any backlog,
 * so they are claimed first), drainer A takes 40, drainer B starts 400 ms later and takes 40, payment sweep off.
 * Correct: the 80 events are each processed exactly once (B gets the second 40, never A's in-flight rows).
 * With COR-13 B would re-claim A's still-processing rows and leave the second 40 pending.
 */
import "../../load-env";
import { eventsOutbox, getAdminDb, sql } from "@rentweb/db";
import { processOutbox } from "@rentweb/integrations/outbox";
import { done, plat } from "./correctness-lib";
const rows = (x: any) => (Array.isArray(x) ? x : x.rows);
async function main() {
  const tag = "qa.correctness.noop." + Date.now().toString(36);
  const base = Date.now() - 3 * 86_400_000;
  await plat((tx) => tx.insert(eventsOutbox).values(Array.from({ length: 80 }, (_, i) => ({ tenantId: null, type: tag, payload: {}, nextRunAt: new Date(base + i), createdAt: new Date(base + i) }))));
  const [a, b] = await Promise.all([processOutbox(getAdminDb(), 40, { expirePayments: false }), new Promise((r) => setTimeout(r, 400)).then(() => processOutbox(getAdminDb(), 40, { expirePayments: false }))]);
  const st = rows(await plat((tx) => tx.execute(sql`select status, count(*)::int n, sum(attempts)::int attempts from events_outbox where type = ${tag} group by status`)));
  console.log("worker A", JSON.stringify(a), "worker B", JSON.stringify(b), "| 80 events → total claimed", a.claimed + b.claimed, "| rows", JSON.stringify(st));
  const doneRow = st.find((r: any) => r.status === "done");
  console.log(a.claimed === 40 && b.claimed === 40 && doneRow?.n === 80 && doneRow?.attempts === 80 ? "PASS COR-13 80 events processed exactly once by two concurrent drainers" : "FAIL COR-13 bug reproduces");
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
