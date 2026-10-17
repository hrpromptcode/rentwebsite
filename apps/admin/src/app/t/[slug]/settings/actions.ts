"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, getAdminDb, ne, tenantInvitations, tenantMembers, tenants, user } from "@rentweb/db";
import { claimCustomDomain, invalidateTenant, removeCustomDomain, verifyCustomDomain } from "@rentweb/core/tenant";
import { isUuid } from "@rentweb/core";
import { randomToken } from "@rentweb/core/crypto";
import { normalizeValidPromptpayId, paymentSetupStatus } from "@rentweb/core/payments";
import { auditLog } from "@/lib/audit";
import { OWN_ACTION_AUDIT, ownStatusTransition, type OwnStatusAction, type TenantStatus } from "@/lib/tenant-status";
import { loadTenantStatusState } from "@/lib/tenant-status-server";
import { assertRole, getTenantCtx, hasRole, ROLE_RANK, tenantHostnames, type MemberRole, type TenantCtx } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";
import { generalSchema, MEMBER_ROLES, paymentsSchema, PROMPTPAY_ID_ERROR, type GeneralInput, type PaymentsInput } from "./shared";

function actor(ctx: TenantCtx) {
  return { actorType: ctx.impersonating ? ("superadmin" as const) : ("user" as const), actorId: ctx.userId };
}

function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

async function refresh(ctx: TenantCtx, paths: string[]) {
  await invalidateTenant(ctx.tenant.id, await tenantHostnames(ctx.tenant.id));
  for (const p of paths) revalidatePath(`/t/${ctx.tenant.slug}${p}`);
  revalidatePath(`/t/${ctx.tenant.slug}`, "layout");
}

/* ---------------------------------- general --------------------------------- */

export async function saveGeneral(slug: string, input: GeneralInput): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const parsed = generalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  const { name, tagline, contact } = parsed.data;
  const prev = (ctx.tenant.settings ?? {}) as Record<string, unknown>;
  const prevContact = (prev.contact ?? {}) as Record<string, unknown>;
  const nextContact: Record<string, unknown> = { ...prevContact, ...compact(contact) };
  // fields the user cleared must be removed from the stored object
  for (const key of Object.keys(contact) as Array<keyof typeof contact>) {
    const v = contact[key];
    if (v === "" || (Array.isArray(v) && v.length === 0)) delete nextContact[key];
  }
  const settings: Record<string, unknown> = { ...prev, contact: nextContact };
  if (tagline) settings.tagline = tagline;
  else delete settings.tagline;

  await getAdminDb().update(tenants).set({ name, settings }).where(eq(tenants.id, ctx.tenant.id));
  await auditLog({ tenantId: ctx.tenant.id, ...actor(ctx), action: "settings.update", targetType: "tenant", targetId: ctx.tenant.id, diff: { section: "general" } });
  await refresh(ctx, ["/settings", "/dashboard"]);
  return { ok: true, message: "บันทึกข้อมูลร้านแล้ว" };
}

/* --------------------------------- payments --------------------------------- */

export async function savePayments(slug: string, input: PaymentsInput): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const parsed = paymentsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  const d = parsed.data;
  const prev = (ctx.tenant.settings ?? {}) as Record<string, unknown>;
  const prevPayments = (prev.payments ?? {}) as Record<string, unknown>;
  const payments: Record<string, unknown> = {
    ...prevPayments,
    bankAccounts: d.bankAccounts,
    enabled: d.enabled,
    autoApproveSlips: d.autoApproveSlips,
    expiresMinutes: d.expiresMinutes,
  };
  // ADMIN_B2-09: store only an ID checkout can use (core rule — a landline or a typo is never saved as the receiver)
  const ppId = d.promptpayId ? normalizeValidPromptpayId(d.promptpayId) : null;
  if (d.promptpayId && !ppId) return { ok: false, error: PROMPTPAY_ID_ERROR };
  if (ppId) payments.promptpayId = ppId;
  else delete payments.promptpayId;
  if (d.promptpayName) payments.promptpayName = d.promptpayName;
  else delete payments.promptpayName;
  if (d.promptpayUseContactPhone === true) payments.promptpayUseContactPhone = true;
  else delete payments.promptpayUseContactPhone;

  const settings = { ...prev, payments };
  await getAdminDb().update(tenants).set({ settings }).where(eq(tenants.id, ctx.tenant.id));
  await auditLog({ tenantId: ctx.tenant.id, ...actor(ctx), action: "settings.update", targetType: "tenant", targetId: ctx.tenant.id, diff: { section: "payments", methods: d.enabled, promptpayUseContactPhone: d.promptpayUseContactPhone === true } });
  await refresh(ctx, ["/settings/payments", "/dashboard"]);
  if (!paymentSetupStatus(settings).ready) return { ok: true, message: "บันทึกแล้ว — แต่ลูกค้ายังชำระเงินออนไลน์ไม่ได้ จนกว่าจะตั้งค่า PromptPay หรือบัญชีธนาคาร" };
  return { ok: true, message: "บันทึกช่องทางรับเงินแล้ว" };
}

/* ---------------------------------- domains --------------------------------- */
// ADMIN_B2-11: claim / verify / remove go through @rentweb/core/tenant (platform_b4). A claim stays "pending"
// (never routed, never blocks the real owner) until TXT + CNAME prove DNS control; only "active" rows route.

export async function addDomain(slug: string, hostnameRaw: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const r = await claimCustomDomain(getAdminDb(), ctx.tenant.id, String(hostnameRaw ?? ""));
  if (!r.ok) return { ok: false, error: r.error };
  await auditLog({ tenantId: ctx.tenant.id, ...actor(ctx), action: "domain.add", targetType: "domain", targetId: r.domain.id, diff: { hostname: r.domain.hostname } });
  await refresh(ctx, ["/settings/domains", "/dashboard"]);
  return { ok: true, message: `เพิ่ม ${r.domain.hostname} แล้ว — ตั้งค่า DNS ตามคำแนะนำแล้วกด “ตรวจสอบ DNS” (โดเมนจะเปิดใช้หลังยืนยันเท่านั้น)` };
}

export async function verifyDomain(slug: string, domainId: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  if (!isUuid(domainId)) return { ok: false, error: "ไม่พบโดเมน" };
  const r = await verifyCustomDomain(getAdminDb(), ctx.tenant.id, domainId);
  if (r.ok || r.code !== "not_found") {
    await auditLog({ tenantId: ctx.tenant.id, ...actor(ctx), action: r.ok ? "domain.verify.ok" : "domain.verify.failed", targetType: "domain", targetId: domainId, diff: { hostname: r.hostname, ...(r.ok ? {} : { code: r.code, error: r.error }) } });
  }
  await refresh(ctx, ["/settings/domains"]);
  return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error };
}

export async function removeDomain(slug: string, domainId: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  if (!isUuid(domainId)) return { ok: false, error: "ไม่พบโดเมน" };
  const hostnames = await tenantHostnames(ctx.tenant.id);
  const r = await removeCustomDomain(getAdminDb(), ctx.tenant.id, domainId);
  if (!r.ok) return { ok: false, error: r.error };
  await invalidateTenant(ctx.tenant.id, hostnames);
  await auditLog({ tenantId: ctx.tenant.id, ...actor(ctx), action: "domain.remove", targetType: "domain", targetId: domainId, diff: { hostname: r.hostname } });
  revalidatePath(`/t/${slug}/settings/domains`);
  return { ok: true, message: "ลบโดเมนแล้ว" };
}

/* ----------------------------------- team ----------------------------------- */

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("อีเมลไม่ถูกต้อง").max(120),
  role: z.enum(MEMBER_ROLES),
});

function canAssign(ctx: TenantCtx, role: MemberRole) {
  // owners may assign anything; others only roles strictly below their own
  return ctx.role === "owner" || ROLE_RANK[role] < ROLE_RANK[ctx.role];
}

export async function inviteMember(slug: string, input: z.input<typeof inviteSchema>): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  const { email, role } = parsed.data;
  if (!canAssign(ctx, role)) return { ok: false, error: "คุณไม่สามารถมอบบทบาทนี้ได้" };
  const db = getAdminDb();

  const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (existingUser) {
    const [member] = await db
      .select({ id: tenantMembers.id })
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, ctx.tenant.id), eq(tenantMembers.userId, existingUser.id)))
      .limit(1);
    if (member) return { ok: false, error: "ผู้ใช้นี้เป็นสมาชิกของทีมอยู่แล้ว" };
  }
  await db.delete(tenantInvitations).where(and(eq(tenantInvitations.tenantId, ctx.tenant.id), eq(tenantInvitations.email, email)));

  const token = randomToken(24);
  await db.insert(tenantInvitations).values({ tenantId: ctx.tenant.id, email, role, token, invitedBy: ctx.userId, expiresAt: new Date(Date.now() + 7 * 86_400_000) });
  await auditLog({ tenantId: ctx.tenant.id, ...actor(ctx), action: "member.invite", targetType: "invitation", diff: { email, role } });
  revalidatePath(`/t/${slug}/settings/team`);
  return { ok: true, message: `สร้างคำเชิญสำหรับ ${email} แล้ว คัดลอกลิงก์เพื่อส่งให้` };
}

export async function revokeInvitation(slug: string, invitationId: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  await getAdminDb().delete(tenantInvitations).where(and(eq(tenantInvitations.id, invitationId), eq(tenantInvitations.tenantId, ctx.tenant.id)));
  revalidatePath(`/t/${slug}/settings/team`);
  return { ok: true, message: "ยกเลิกคำเชิญแล้ว" };
}

async function loadMember(ctx: TenantCtx, memberId: string) {
  const [m] = await getAdminDb()
    .select({ id: tenantMembers.id, userId: tenantMembers.userId, role: tenantMembers.role })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.id, memberId), eq(tenantMembers.tenantId, ctx.tenant.id)))
    .limit(1);
  return m ?? null;
}

async function countOwners(tenantId: string) {
  const rows = await getAdminDb()
    .select({ id: tenantMembers.id })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.role, "owner")));
  return rows.length;
}

export async function changeMemberRole(slug: string, memberId: string, roleRaw: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const role = z.enum(MEMBER_ROLES).safeParse(roleRaw);
  if (!role.success) return { ok: false, error: "บทบาทไม่ถูกต้อง" };
  const m = await loadMember(ctx, memberId);
  if (!m) return { ok: false, error: "ไม่พบสมาชิก" };
  if (m.role === "owner" && !hasRole(ctx, "owner")) return { ok: false, error: "เฉพาะเจ้าของเท่านั้นที่แก้ไขเจ้าของได้" };
  // same rule as removeMember: non-owners may only change members ranked strictly below them (self excepted)
  if (m.userId !== ctx.userId && !canAssign(ctx, m.role as MemberRole)) return { ok: false, error: "คุณไม่สามารถเปลี่ยนบทบาทของสมาชิกที่มีบทบาทเท่ากันหรือสูงกว่าได้" };
  if (!canAssign(ctx, role.data)) return { ok: false, error: "คุณไม่สามารถมอบบทบาทนี้ได้" };
  if (m.role === "owner" && role.data !== "owner" && (await countOwners(ctx.tenant.id)) <= 1) return { ok: false, error: "ต้องมีเจ้าของอย่างน้อย 1 คน" };
  await getAdminDb().update(tenantMembers).set({ role: role.data }).where(eq(tenantMembers.id, m.id));
  await auditLog({ tenantId: ctx.tenant.id, ...actor(ctx), action: "member.role.change", targetType: "member", targetId: m.id, diff: { from: m.role, to: role.data, userId: m.userId } });
  revalidatePath(`/t/${slug}/settings/team`);
  revalidatePath(`/t/${slug}`, "layout");
  return { ok: true, message: "เปลี่ยนบทบาทแล้ว" };
}

export async function removeMember(slug: string, memberId: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const m = await loadMember(ctx, memberId);
  if (!m) return { ok: false, error: "ไม่พบสมาชิก" };
  if (m.role === "owner" && !hasRole(ctx, "owner")) return { ok: false, error: "เฉพาะเจ้าของเท่านั้นที่ลบเจ้าของได้" };
  if (m.role === "owner" && (await countOwners(ctx.tenant.id)) <= 1) return { ok: false, error: "ต้องมีเจ้าของอย่างน้อย 1 คน" };
  if (m.userId !== ctx.userId && !canAssign(ctx, m.role as MemberRole)) return { ok: false, error: "คุณไม่สามารถลบสมาชิกที่มีบทบาทสูงกว่าได้" };
  await getAdminDb().delete(tenantMembers).where(eq(tenantMembers.id, m.id));
  await auditLog({ tenantId: ctx.tenant.id, ...actor(ctx), action: "member.remove", targetType: "member", targetId: m.id, diff: { userId: m.userId, role: m.role } });
  revalidatePath(`/t/${slug}/settings/team`);
  revalidatePath(`/t/${slug}`, "layout");
  return { ok: true, message: "นำสมาชิกออกแล้ว" };
}

/* ------------------------------- danger zone -------------------------------- */

async function setOwnStatus(slug: string, action: OwnStatusAction, message: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "owner");
  const state = await loadTenantStatusState(ctx.tenant.id);
  if (!state) return { ok: false, error: "ไม่พบร้าน" };
  const decision = ownStatusTransition(action, state);
  if (!decision.ok) return { ok: false, error: decision.error };
  const next = decision.next;
  const suspendedAt = next === "suspended" ? new Date() : null;
  // optimistic: only apply when nobody (e.g. RentWeb staff) changed the status since we read it
  const updated = await getAdminDb()
    .update(tenants)
    .set({ status: next, suspendedAt })
    .where(and(eq(tenants.id, ctx.tenant.id), eq(tenants.status, state.status as TenantStatus), ne(tenants.status, "deleted")))
    .returning({ id: tenants.id });
  if (updated.length === 0) return { ok: false, error: "สถานะร้านเพิ่งถูกเปลี่ยน กรุณารีเฟรชหน้าแล้วลองอีกครั้ง" };
  await auditLog({
    tenantId: ctx.tenant.id,
    ...actor(ctx),
    action: OWN_ACTION_AUDIT[action],
    targetType: "tenant",
    targetId: ctx.tenant.id,
    diff: { from: state.status, to: next, by: "owner", ...(suspendedAt ? { suspendedAt: suspendedAt.toISOString() } : {}) },
  });
  await refresh(ctx, ["/settings/danger", "/settings/billing", "/dashboard"]);
  return { ok: true, message };
}

export async function suspendOwnTenant(slug: string) {
  return setOwnStatus(slug, "suspend", "ระงับเว็บไซต์ชั่วคราวแล้ว");
}
export async function reactivateOwnTenant(slug: string) {
  return setOwnStatus(slug, "reactivate", "เปิดใช้งานเว็บไซต์อีกครั้งแล้ว");
}
export async function cancelOwnTenant(slug: string) {
  return setOwnStatus(slug, "cancel", "ยกเลิกเว็บไซต์แล้ว");
}
