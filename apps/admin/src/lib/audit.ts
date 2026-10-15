import "server-only";
import { auditLogs, getAdminDb } from "@rentweb/db";
import { requestMeta } from "./session";

/** Platform-level audit entry (audit_logs is not RLS-protected). */
export async function auditLog(entry: {
  tenantId: string | null;
  actorType: "user" | "superadmin" | "system";
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  diff?: Record<string, unknown>;
}) {
  const meta = await requestMeta().catch(() => ({ ip: null, userAgent: null }));
  await getAdminDb().insert(auditLogs).values({
    tenantId: entry.tenantId,
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    diff: entry.diff,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}
