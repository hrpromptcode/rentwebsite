/**
 * correctness bughunt – two outbox drainers at once (e.g. cron route + worker, or overlapping cron calls).
 * 40 synthetic no-op events whose created_at is 1h old (like any backlog / delayed reminder).
 */
import "../../load-env";
import { eventsOutbox, getAdminDb, sql } from "@rentweb/db";
import { processOutbox } from "@rentweb/integrations/outbox";
import { done, plat } from "./correctness-lib";
const rows = (x: any) => (Array.isArray(x) ? x : x.rows);
async function main() {
  const tag = "qa.correctness.noop." + Date.now().toString(36);
  const old = new Date(Date.now() - 3_600_000);
  await plat((tx) => tx.insert(eventsOutbox).values(Array.from({ length: 40 }, () => ({ tenantId: null, type: tag, payload: {}, nextRunAt: old, createdAt: old }))));
  const [a, b] = await Promise.all([processOutbox(getAdminDb(), 100), new Promise((r) => setTimeout(r, 400)).then(() => processOutbox(getAdminDb(), 100))]);
  const st = rows(await plat((tx) => tx.execute(sql`select status, count(*)::int n, sum(attempts)::int attempts from events_outbox where type = ${tag} group by status`)));
  console.log("worker A", JSON.stringify(a), "worker B", JSON.stringify(b), "| 40 events → total claimed", a.claimed + b.claimed, "| rows", JSON.stringify(st));
  await done();
}
main().catch(async (e) => { console.error(e); await done(); process.exit(1); });
