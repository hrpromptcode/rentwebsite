import "server-only";
import { and, desc, eq, getAdminDb, inArray, subscriptions, auditLogs, tenants } from "@rentweb/db";
import { STATUS_AUDIT_ACTIONS, suspensionInfo, type StatusEvent, type SuspensionInfo } from "./tenant-status";

export interface TenantStatusState {
  status: string;
  trialEndsAt: Date | null;
  suspendedAt: Date | null;
  lastEvent: StatusEvent | null;
  hasPaidSubscription: boolean;
}

/** Current status row + the latest status-changing audit entry + whether a paid subscription is running. */
export async function loadTenantStatusState(tenantId: string, now = new Date()): Promise<TenantStatusState | null> {
  const db = getAdminDb();
  const [cur] = await db.select({ status: tenants.status, trialEndsAt: tenants.trialEndsAt, suspendedAt: tenants.suspendedAt }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!cur) return null;
  const [ev] = await db
    .select({ action: auditLogs.action, actorType: auditLogs.actorType, diff: auditLogs.diff, createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(and(eq(auditLogs.tenantId, tenantId), inArray(auditLogs.action, [...STATUS_AUDIT_ACTIONS])))
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);
  const [sub] = await db
    .select({ status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const hasPaidSubscription = !!sub && sub.status === "active" && (!sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() > now.getTime());
  return { ...cur, lastEvent: ev ? { ...ev, diff: ev.diff ?? null } : null, hasPaidSubscription };
}

export async function loadSuspensionInfo(tenantId: string): Promise<SuspensionInfo | null> {
  const s = await loadTenantStatusState(tenantId);
  return s ? suspensionInfo(s) : null;
}
