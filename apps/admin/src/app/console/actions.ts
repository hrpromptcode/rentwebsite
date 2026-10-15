"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, getAdminDb, plans, session as sessionTable, tenants } from "@rentweb/db";
import { invalidateTenant } from "@rentweb/core/tenant";
import { auditLog } from "@/lib/audit";
import { requireSuperadmin } from "@/lib/session";
import { tenantHostnames } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";

/** Superadmin enters a tenant back-office: marks the session and opens the dashboard with a banner. */
export async function startImpersonation(tenantId: string) {
  const s = await requireSuperadmin();
  const db = getAdminDb();
  const [t] = await db.select({ id: tenants.id, slug: tenants.slug, name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) throw new Error("ไม่พบร้านนี้");
  await db.update(sessionTable).set({ activeTenantId: t.id, impersonatedBy: s.user.id }).where(eq(sessionTable.id, s.session.id));
  await auditLog({ tenantId: t.id, actorType: "superadmin", actorId: s.user.id, action: "superadmin.impersonate.start", targetType: "tenant", targetId: t.id, diff: { slug: t.slug } });
  redirect(`/t/${t.slug}/dashboard`);
}

export async function stopImpersonation() {
  const s = await requireSuperadmin();
  const db = getAdminDb();
  const tenantId = s.session.activeTenantId ?? null;
  await db.update(sessionTable).set({ activeTenantId: null, impersonatedBy: null }).where(eq(sessionTable.id, s.session.id));
  await auditLog({ tenantId, actorType: "superadmin", actorId: s.user.id, action: "superadmin.impersonate.stop", targetType: "tenant", targetId: tenantId ?? undefined });
  redirect(tenantId ? `/console/tenants/${tenantId}` : "/console/tenants");
}

const planSchema = z.object({ tenantId: z.string().uuid(), planKey: z.string().min(1) });

export async function updateTenantPlan(input: z.input<typeof planSchema>): Promise<ActionResult> {
  const s = await requireSuperadmin();
  const { tenantId, planKey } = planSchema.parse(input);
  const db = getAdminDb();
  const [plan] = await db.select({ key: plans.key }).from(plans).where(eq(plans.key, planKey)).limit(1);
  if (!plan) return { ok: false, error: "ไม่พบแพ็กเกจ" };
  const [before] = await db.select({ planKey: tenants.planKey }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  await db.update(tenants).set({ planKey }).where(eq(tenants.id, tenantId));
  await invalidateTenant(tenantId, await tenantHostnames(tenantId));
  await auditLog({ tenantId, actorType: "superadmin", actorId: s.user.id, action: "tenant.plan.change", targetType: "tenant", targetId: tenantId, diff: { from: before?.planKey, to: planKey } });
  revalidatePath(`/console/tenants/${tenantId}`);
  return { ok: true, message: "เปลี่ยนแพ็กเกจแล้ว" };
}

const statusSchema = z.object({ tenantId: z.string().uuid(), status: z.enum(["trialing", "active", "past_due", "suspended", "cancelled"]) });

export async function updateTenantStatus(input: z.input<typeof statusSchema>): Promise<ActionResult> {
  const s = await requireSuperadmin();
  const { tenantId, status } = statusSchema.parse(input);
  const db = getAdminDb();
  const [before] = await db.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  await db
    .update(tenants)
    .set({ status, suspendedAt: status === "suspended" ? new Date() : null })
    .where(eq(tenants.id, tenantId));
  await invalidateTenant(tenantId, await tenantHostnames(tenantId));
  await auditLog({ tenantId, actorType: "superadmin", actorId: s.user.id, action: "tenant.status.change", targetType: "tenant", targetId: tenantId, diff: { from: before?.status, to: status } });
  revalidatePath(`/console/tenants/${tenantId}`);
  revalidatePath("/console/tenants");
  return { ok: true, message: "อัปเดตสถานะแล้ว" };
}

const trialSchema = z.object({ tenantId: z.string().uuid(), days: z.coerce.number().int().min(1).max(365) });

export async function extendTrial(input: z.input<typeof trialSchema>): Promise<ActionResult> {
  const s = await requireSuperadmin();
  const { tenantId, days } = trialSchema.parse(input);
  const db = getAdminDb();
  const [t] = await db.select({ trialEndsAt: tenants.trialEndsAt }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) return { ok: false, error: "ไม่พบร้านนี้" };
  const base = t.trialEndsAt && t.trialEndsAt.getTime() > Date.now() ? t.trialEndsAt : new Date();
  const next = new Date(base.getTime() + days * 86_400_000);
  await db.update(tenants).set({ trialEndsAt: next, status: "trialing" }).where(eq(tenants.id, tenantId));
  await invalidateTenant(tenantId, await tenantHostnames(tenantId));
  await auditLog({ tenantId, actorType: "superadmin", actorId: s.user.id, action: "tenant.trial.extend", targetType: "tenant", targetId: tenantId, diff: { days, until: next.toISOString() } });
  revalidatePath(`/console/tenants/${tenantId}`);
  return { ok: true, message: `ขยายทดลองใช้อีก ${days} วัน` };
}
