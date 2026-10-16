import "./load-env";
import { getAdminDb } from "@rentweb/db";
import { processOutbox } from "@rentweb/integrations/outbox";

/**
 * Dev/self-host worker: drains the events outbox every few seconds and (via processOutbox) runs the payment
 * expiry sweep that expires stale unpaid payments and lets their modules release stock / slots / tables.
 *   pnpm --filter @rentweb/tooling worker
 * In production you can run this process on a VPS, or hit /api/internal/outbox from a cron instead.
 */
const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 5000);
/**
 * The modules register their payment hooks (paid / closed handlers) as a side effect of their register.ts.
 * Load them through the storefront's registry so the worker has exactly the handlers the web app has; the
 * expiry sweep never expires a payment whose refType has no closed handler in this process.
 * (Non-literal specifier: keeps the app's sources out of tooling's typecheck.)
 */
const MODULE_REGISTRY = "../apps/web/src/modules.ts";
const db = getAdminDb();
let stopping = false;

async function registerModules() {
  try {
    await import(MODULE_REGISTRY);
    console.log("[worker] module payment handlers registered");
  } catch (e) {
    console.warn(`[worker] could not load ${MODULE_REGISTRY}; payment expiry only covers handlers registered in this process:`, e instanceof Error ? e.message : e);
  }
}

async function loop() {
  while (!stopping) {
    try {
      const r = await processOutbox(db, 50);
      if (r.claimed || r.expired) console.log(`[worker] claimed=${r.claimed} done=${r.done} retried=${r.retried} failed=${r.failed} ignored=${r.ignored} expiredPayments=${r.expired}`);
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
void registerModules().then(loop);
