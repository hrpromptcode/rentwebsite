// COR-33 wiring check (read-only on the dev DB):
//  1. the worker can load every module's payment hooks the same way tooling/worker.ts does
//  2. the cron route /api/internal/outbox runs the expiry sweep (limit=0: claims no events)
// Run from tooling/:  npx tsx qa/bughunt/fixes/COR-33-verify.ts
import "../../../load-env";
import { paymentHookSummary } from "@rentweb/core/payments";

const MODULE_REGISTRY = "../../../../apps/web/src/modules.ts";
await import(MODULE_REGISTRY);
const hooks = paymentHookSummary();
console.log("hooks in worker process:", JSON.stringify(hooks));
const paidOk = ["order", "booking", "rest_order", "reservation", "topup"].every((r) => hooks.paid.includes(r));
console.log(paidOk ? "PASS worker loads module payment handlers" : "FAIL worker missing module payment handlers");
const r = await fetch("http://localhost:3000/api/internal/outbox?limit=0", { method: "POST" });
const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
console.log("cron route:", r.status, JSON.stringify(j));
const routeOk = r.status === 200 && typeof j.expired === "number" && j.claimed === 0;
console.log(routeOk ? "PASS cron route runs the expiry sweep" : "FAIL cron route");
console.log(hooks.closed.length ? `closed handlers: ${hooks.closed.join(", ")}` : "NOTE no module registers a closed handler yet -> sweep expires nothing until the module batch adds registerPaymentClosedHandler (see payments-api.md)");
process.exit(paidOk && routeOk ? 0 : 1);
