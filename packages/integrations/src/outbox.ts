import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { eventsOutbox, withPlatform, type Db, type Tx } from "@rentweb/db";
import { HANDLERS, IGNORED_EVENTS, type OutboxEvent } from "./events/handlers";

export interface ProcessResult {
  claimed: number;
  done: number;
  failed: number;
  retried: number;
  ignored: number;
}

const MAX_ATTEMPTS = 8;

/**
 * Claims up to `limit` pending events (FOR UPDATE SKIP LOCKED so several workers can run) and
 * executes their handlers. Each event is processed in its own platform transaction so one failure
 * never blocks the batch. Safe to call from a cron route, a long-running worker, or tests.
 */
export async function processOutbox(db: Db, limit = 25): Promise<ProcessResult> {
  const result: ProcessResult = { claimed: 0, done: 0, failed: 0, retried: 0, ignored: 0 };

  const claimed = await withPlatform(db, async (tx) => {
    const rows = (await tx.execute(sql`
      update events_outbox set status = 'processing', attempts = attempts + 1
      where id in (
        select id from events_outbox
        where status in ('pending', 'processing') and next_run_at <= now()
          and (status = 'pending' or processed_at is null and created_at < now() - interval '10 minutes')
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
          .where(eq(eventsOutbox.id, ev.id));
      });
      if (ev.attempts >= MAX_ATTEMPTS) result.failed++;
      else result.retried++;
      if (process.env.NODE_ENV !== "production") console.error(`[outbox] ${ev.type} ${ev.id} failed:`, msg);
    }
  }
  return result;
}

async function runOne(tx: Tx, ev: OutboxEvent, result: ProcessResult) {
  const handler = HANDLERS[ev.type];
  if (!handler) {
    await tx.update(eventsOutbox).set({ status: "done", processedAt: new Date(), lastError: IGNORED_EVENTS.has(ev.type) ? null : "no handler" }).where(eq(eventsOutbox.id, ev.id));
    result.ignored++;
    return;
  }
  const outcome = await handler(tx, ev);
  if (outcome && typeof outcome === "object" && "retryInSeconds" in outcome) {
    await tx.update(eventsOutbox).set({ status: "pending", nextRunAt: new Date(Date.now() + outcome.retryInSeconds * 1000) }).where(eq(eventsOutbox.id, ev.id));
    result.retried++;
    return;
  }
  await tx.update(eventsOutbox).set({ status: "done", processedAt: new Date(), lastError: null }).where(eq(eventsOutbox.id, ev.id));
  result.done++;
}
