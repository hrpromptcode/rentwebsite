import { and, eq, sql } from "drizzle-orm";
import { eventsOutbox, withPlatform, type DbLike, type Tx } from "@rentweb/db";
import { expireStalePayments } from "@rentweb/core/payments";
import { HANDLERS, IGNORED_EVENTS, type OutboxEvent } from "./events/handlers";

export interface ProcessResult {
  claimed: number;
  done: number;
  failed: number;
  retried: number;
  ignored: number;
  /** stale unpaid payments expired by the payment sweep during this call (see expireStalePayments) */
  expired: number;
}

export interface ProcessOptions {
  /**
   * Run the payment expiry sweep (expireStalePayments) before draining: "auto" (default) at most once per
   * PAYMENT_SWEEP_INTERVAL_MS (60 s) per process, true = always, false = never.
   */
  expirePayments?: boolean | "auto";
}

const MAX_ATTEMPTS = 8;
/**
 * A claimed event is leased for this long (next_run_at = claim time + lease). Only an event whose lease ran
 * out — its worker crashed or hung — can be claimed again. Must stay far above any handler's run time.
 */
const LEASE_SECONDS = Math.max(60, Number(process.env.OUTBOX_LEASE_SECONDS ?? 900) || 900);
const SWEEP_INTERVAL_MS = Number(process.env.PAYMENT_SWEEP_INTERVAL_MS ?? 60_000) || 60_000;
let lastSweep = 0;

/**
 * Claims up to `limit` due events and executes their handlers. Claiming is one UPDATE over
 * `FOR UPDATE SKIP LOCKED` rows that are either pending and due, or processing with an expired lease, and it
 * pushes next_run_at forward by the lease — so a second drainer (cron route + worker, overlapping crons) never
 * picks up rows another worker is still processing. `attempts` doubles as a fencing token: completion only
 * updates the row while it still carries the attempt number this worker claimed.
 * Each event is processed in its own platform transaction so one failure never blocks the batch.
 * Safe to call from a cron route, a long-running worker, or tests.
 */
export async function processOutbox(db: DbLike, limit = 25, opts: ProcessOptions = {}): Promise<ProcessResult> {
  const result: ProcessResult = { claimed: 0, done: 0, failed: 0, retried: 0, ignored: 0, expired: 0 };

  const sweep = opts.expirePayments ?? "auto";
  if (sweep === true || (sweep === "auto" && Date.now() - lastSweep >= SWEEP_INTERVAL_MS)) {
    lastSweep = Date.now();
    try {
      result.expired = (await expireStalePayments(db)).expired;
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.error("[outbox] payment expiry sweep failed:", err instanceof Error ? err.message : err);
    }
  }

  const claimed = await withPlatform(db, async (tx) => {
    const rows = (await tx.execute(sql`
      update events_outbox
      set status = 'processing', attempts = attempts + 1, next_run_at = now() + ${LEASE_SECONDS}::int * interval '1 second'
      where id in (
        select id from events_outbox
        where status in ('pending', 'processing') and next_run_at <= now()
        order by next_run_at asc
        limit ${limit}
        for update skip locked
      )
      returning id, tenant_id, type, payload, attempts
    `)) as unknown as { rows?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
    const list = Array.isArray(rows) ? rows : (rows.rows ?? []);
    return list.map((r) => ({ id: String(r.id), tenantId: (r.tenant_id as string | null) ?? null, type: String(r.type), payload: (r.payload as Record<string, unknown>) ?? {}, attempts: Number(r.attempts) })) as OutboxEvent[];
  });
  result.claimed = claimed.length;

  for (const ev of claimed) {
    try {
      await withPlatform(db, async (tx) => {
        await runOne(tx, ev, result);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await withPlatform(db, async (tx) => {
        const giveUp = ev.attempts >= MAX_ATTEMPTS;
        await tx
          .update(eventsOutbox)
          .set({ status: giveUp ? "failed" : "pending", lastError: msg.slice(0, 1000), nextRunAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** ev.attempts) * 1000), processedAt: giveUp ? new Date() : null })
          .where(owned(ev));
      });
      if (ev.attempts >= MAX_ATTEMPTS) result.failed++;
      else result.retried++;
      if (process.env.NODE_ENV !== "production") console.error(`[outbox] ${ev.type} ${ev.id} failed:`, msg);
    }
  }
  return result;
}

/** The row as this worker claimed it (a re-claim after an expired lease bumps attempts and fences us out). */
function owned(ev: OutboxEvent) {
  return and(eq(eventsOutbox.id, ev.id), eq(eventsOutbox.status, "processing"), eq(eventsOutbox.attempts, ev.attempts));
}

async function runOne(tx: Tx, ev: OutboxEvent, result: ProcessResult) {
  const handler = HANDLERS[ev.type];
  if (!handler) {
    await tx.update(eventsOutbox).set({ status: "done", processedAt: new Date(), lastError: IGNORED_EVENTS.has(ev.type) ? null : "no handler" }).where(owned(ev));
    result.ignored++;
    return;
  }
  const outcome = await handler(tx, ev);
  if (outcome && typeof outcome === "object" && "retryInSeconds" in outcome) {
    await tx.update(eventsOutbox).set({ status: "pending", nextRunAt: new Date(Date.now() + outcome.retryInSeconds * 1000) }).where(owned(ev));
    result.retried++;
    return;
  }
  await tx.update(eventsOutbox).set({ status: "done", processedAt: new Date(), lastError: null }).where(owned(ev));
  result.done++;
}
