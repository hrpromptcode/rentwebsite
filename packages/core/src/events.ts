import { auditLogs, eventsOutbox, type Tx } from "@rentweb/db";

/** Writes a domain event into the outbox inside the current transaction (worker picks it up). */
export async function emitEvent(
  tx: Tx,
  event: { tenantId: string | null; type: string; payload?: Record<string, unknown>; delaySeconds?: number },
) {
  await tx.insert(eventsOutbox).values({
    tenantId: event.tenantId,
    type: event.type,
    payload: event.payload ?? {},
    nextRunAt: new Date(Date.now() + (event.delaySeconds ?? 0) * 1000),
  });
}

export async function audit(
  tx: Tx,
  entry: {
    tenantId: string | null;
    actorType: "user" | "customer" | "system" | "superadmin";
    actorId?: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    diff?: Record<string, unknown>;
    ip?: string | null;
    userAgent?: string | null;
  },
) {
  await tx.insert(auditLogs).values({
    tenantId: entry.tenantId,
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    diff: entry.diff,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
  });
}
