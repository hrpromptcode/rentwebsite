/**
 * Tenant lifecycle rules for owner self-service (Settings > Danger zone).
 *
 * Pure functions (no DB / server-only imports) so they can be unit-checked from tooling scripts.
 * "Who changed the status and why" is recorded in audit_logs — the append-only record the tenant
 * cannot edit — and the latest status-changing entry decides whether an owner may undo a suspension:
 *   - an owner may lift only a suspension they made themselves (tenant.self.suspend);
 *   - a platform suspension (superadmin tenant.status.change), a cancellation and past_due (unpaid)
 *     can only be cleared by RentWeb staff / billing;
 *   - lifting a self-suspension returns to the status it interrupted, except that an expired trial
 *     lands in past_due (unless a paid subscription is running) — never a free "active".
 */

export type TenantStatus = "trialing" | "active" | "past_due" | "suspended" | "cancelled" | "deleted";
export type OwnStatusAction = "suspend" | "reactivate" | "cancel";

/** audit_logs actions that change tenants.status. */
export const STATUS_AUDIT_ACTIONS = ["tenant.status.change", "tenant.trial.extend", "tenant.self.suspend", "tenant.self.reactivate", "tenant.self.cancel"] as const;

export const OWN_ACTION_AUDIT: Record<OwnStatusAction, (typeof STATUS_AUDIT_ACTIONS)[number]> = {
  suspend: "tenant.self.suspend",
  reactivate: "tenant.self.reactivate",
  cancel: "tenant.self.cancel",
};

/** Latest status-changing audit entry (or null when none exists). */
export interface StatusEvent {
  action: string;
  actorType: string;
  diff: Record<string, unknown> | null;
  createdAt: Date;
}

export interface SuspensionInfo {
  /** "owner" = suspended from the tenant's own danger zone; "platform" = by RentWeb staff (or unknown → treated as platform). */
  by: "owner" | "platform";
  reason: string | null;
  at: Date | null;
  /** status the self-suspension interrupted (from the audit diff) */
  previous: TenantStatus | null;
}

const STATUSES = new Set<TenantStatus>(["trialing", "active", "past_due", "suspended", "cancelled", "deleted"]);
const asStatus = (v: unknown): TenantStatus | null => (typeof v === "string" && STATUSES.has(v as TenantStatus) ? (v as TenantStatus) : null);
const asText = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Who suspended a tenant that is currently `suspended`; null when the tenant is not suspended. */
export function suspensionInfo(input: { status: string; suspendedAt: Date | null; lastEvent: StatusEvent | null }): SuspensionInfo | null {
  if (input.status !== "suspended") return null;
  const e = input.lastEvent;
  const diff = e?.diff ?? {};
  const base = { reason: asText(diff.reason), at: input.suspendedAt ?? e?.createdAt ?? null, previous: asStatus(diff.from) };
  if (!e || e.action !== "tenant.self.suspend" || asStatus(diff.to) !== "suspended") return { ...base, by: "platform" };
  // The self-suspend entry records the suspended_at it wrote; if the row was suspended again later by a
  // path that did not leave an audit entry, the timestamps no longer match → not the owner's suspension.
  const stamped = typeof diff.suspendedAt === "string" ? Date.parse(diff.suspendedAt) : NaN;
  if (Number.isFinite(stamped) && input.suspendedAt && Math.abs(stamped - input.suspendedAt.getTime()) > 1000) return { ...base, by: "platform" };
  return { ...base, by: "owner" };
}

export type TransitionResult = { ok: true; next: TenantStatus } | { ok: false; error: string };

export const OWN_STATUS_ERRORS = {
  deleted: "ไม่พบร้าน",
  alreadySuspended: "เว็บไซต์ถูกระงับอยู่แล้ว",
  cancelled: "เว็บไซต์นี้ถูกยกเลิกแล้ว หากต้องการเปิดกลับ กรุณาติดต่อทีมงาน RentWeb",
  pastDue: "เว็บไซต์ค้างชำระค่าบริการ กรุณาชำระค่าบริการในหน้าแพ็กเกจและการชำระเงิน",
  platformSuspended: "เว็บไซต์ถูกระงับโดยทีมงาน RentWeb จึงเปิดใช้งานเองไม่ได้ กรุณาติดต่อทีมงาน",
  notSuspended: "เว็บไซต์ไม่ได้ถูกระงับ",
} as const;

/** Where lifting an owner's own suspension lands. */
export function reactivationTarget(previous: TenantStatus | null, trialEndsAt: Date | null, hasPaidSubscription: boolean, now: Date): TenantStatus {
  const trialRunning = !!trialEndsAt && trialEndsAt.getTime() > now.getTime();
  if (previous === "past_due") return "past_due";
  if (previous === "active") return "active";
  // previous trialing / unknown
  if (trialRunning) return "trialing";
  return hasPaidSubscription ? "active" : "past_due";
}

/** Decides the owner's self-service status change. */
export function ownStatusTransition(
  action: OwnStatusAction,
  input: { status: string; trialEndsAt: Date | null; suspendedAt: Date | null; lastEvent: StatusEvent | null; hasPaidSubscription: boolean; now?: Date },
): TransitionResult {
  const now = input.now ?? new Date();
  const status = asStatus(input.status);
  if (!status || status === "deleted") return { ok: false, error: OWN_STATUS_ERRORS.deleted };
  switch (action) {
    case "suspend":
      if (status === "suspended") return { ok: false, error: OWN_STATUS_ERRORS.alreadySuspended };
      if (status === "cancelled") return { ok: false, error: OWN_STATUS_ERRORS.cancelled };
      return { ok: true, next: "suspended" };
    case "cancel":
      if (status === "cancelled") return { ok: false, error: OWN_STATUS_ERRORS.cancelled };
      return { ok: true, next: "cancelled" };
    case "reactivate": {
      if (status === "cancelled") return { ok: false, error: OWN_STATUS_ERRORS.cancelled };
      if (status === "past_due") return { ok: false, error: OWN_STATUS_ERRORS.pastDue };
      if (status !== "suspended") return { ok: false, error: OWN_STATUS_ERRORS.notSuspended };
      const info = suspensionInfo(input);
      if (!info || info.by !== "owner") return { ok: false, error: OWN_STATUS_ERRORS.platformSuspended };
      return { ok: true, next: reactivationTarget(info.previous, input.trialEndsAt, input.hasPaidSubscription, now) };
    }
  }
}
