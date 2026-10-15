import "./load-env";
import { getAdminDb } from "@rentweb/db";
import { processOutbox } from "@rentweb/integrations/outbox";

/**
 * Dev/self-host worker: drains the events outbox every few seconds.
 *   pnpm --filter @rentweb/tooling worker
 * In production you can run this process on a VPS, or hit /api/internal/outbox from a cron instead.
 */
const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 5000);
const db = getAdminDb();
let stopping = false;

async function loop() {
  while (!stopping) {
    try {
      const r = await processOutbox(db, 50);
      if (r.claimed) console.log(`[worker] claimed=${r.claimed} done=${r.done} retried=${r.retried} failed=${r.failed} ignored=${r.ignored}`);
    } catch (e) {
      console.error("[worker] tick failed", e);
    }
    await new Promise((res) => setTimeout(res, INTERVAL_MS));
  }
}

process.on("SIGINT", () => {
  stopping = true;
  setTimeout(() => process.exit(0), 200);
});

console.log(`[worker] started, polling every ${INTERVAL_MS}ms`);
loop();
