"use server";

import { promises as dns } from "node:dns";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, getAdminDb, ne, tenantDomains, tenantInvitations, tenantMembers, tenants, user } from "@rentweb/db";
import { invalidateTenant } from "@rentweb/core/tenant";
import { randomToken } from "@rentweb/core/crypto";
import { rootDomain } from "@rentweb/core/env";
import { auditLog } from "@/lib/audit";
import { assertRole, getTenantCtx, hasRole, ROLE_RANK, tenantHostnames, type MemberRole, type TenantCtx } from "@/lib/tenant";
import type { ActionResult } from "@/components/ui/form";
import { generalSchema, MEMBER_ROLES, paymentsSchema, type GeneralInput, type PaymentsInput } from "./shared";

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
  const ppId = d.promptpayId?.replace(/[^0-9]/g, "") ?? "";
  if (ppId) payments.promptpayId = ppId;
  else delete payments.promptpayId;
  if (d.promptpayName) payments.promptpayName = d.promptpayName;
  else delete payments.promptpayName;

  await getAdminDb().update(tenants).set({ settings: { ...prev, payments } }).where(eq(tenants.id, ctx.tenant.id));
  await auditLog({ tenantId: ctx.tenant.id, ...actor(ctx), action: "settings.update", targetType: "tenant", targetId: ctx.tenant.id, diff: { section: "payments", methods: d.enabled } });
  await refresh(ctx, ["/settings/payments", "/dashboard"]);
  return { ok: true, message: "บันทึกช่องทางรับเงินแล้ว" };
}

/* ---------------------------------- domains --------------------------------- */

const HOSTNAME_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export async function addDomain(slug: string, hostnameRaw: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const hostname = hostnameRaw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!HOSTNAME_RE.test(hostname)) return { ok: false, error: "ชื่อโดเมนไม่ถูกต้อง เช่น www.myshop.com" };
  const root = rootDomain().toLowerCase();
  if (hostname === root || hostname.endsWith(`.${root}`)) return { ok: false, error: `โดเมนภายใต้ ${root} ถูกจัดการโดยระบบอยู่แล้ว` };
  const db = getAdminDb();
  const [exists] = await db.select({ id: tenantDomains.id }).from(tenantDomains).where(eq(tenantDomains.hostname, hostname)).limit(1);
  if (exists) return { ok: false, error: "โดเมนนี้ถูกใช้งานแล้ว" };
  const [row] = await db
    .insert(tenantDomains)
    .values({ tenantId: ctx.tenant.id, hostname, kind: "custom", status: "pending", verificationToken: `rentweb-verify=${randomToken(16)}` })
    .returning({ id: tenantDomains.id });
  await auditLog({ tenantId: ctx.tenant.id, ...actor(ctx), action: "domain.add", targetType: "domain", targetId: row?.id, diff: { hostname } });
  await refresh(ctx, ["/settings/domains", "/dashboard"]);
  return { ok: true, message: "เพิ่มโดเมนแล้ว ตั้งค่า DNS ตามคำแนะนำแล้วกดตรวจสอบ" };
}

export async function verifyDomain(slug: string, domainId: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const db = getAdminDb();
  const [d] = await db.select().from(tenantDomains).where(and(eq(tenantDomains.id, domainId), eq(tenantDomains.tenantId, ctx.tenant.id))).limit(1);
  if (!d || d.kind !== "custom") return { ok: false, error: "ไม่พบโดเมน" };
  await db.update(tenantDomains).set({ status: "verifying", lastCheckedAt: new Date() }).where(eq(tenantDomains.id, d.id));

  const target = `${ctx.tenant.slug}.${rootDomain()}`.toLowerCase();
  let error: string | null = null;
  try {
    const txt = await dns.resolveTxt(`_rentweb.${d.hostname}`).catch(() => [] as string[][]);
    const txtOk = txt.some((parts) => parts.join("") === d.verificationToken);
    const cname = await dns.resolveCname(d.hostname).catch(() => [] as string[]);
    const cnameOk = cname.some((c) => c.toLowerCase().replace(/\.$/, "") === target);
    if (!txtOk) error = `ไม่พบ TXT record ที่ _rentweb.${d.hostname}`;
    else if (!cnameOk) error = `CNAME ของ ${d.hostname} ยังไม่ชี้ไปที่ ${target}`;
  } catch (e) {
    error = e instanceof Error ? e.message : "ตรวจสอบ DNS ไม่สำเร็จ";
  }

  await db
    .update(tenantDomains)
    .set(error ? { status: "failed", lastError: error } : { status: "active", lastError: null, verifiedAt: new Date(), sslStatus: "pending" })
    .where(eq(tenantDomains.id, d.id));
  await auditLog({ tenantId: ctx.tenant.id, ...actor(ctx), action: error ? "domain.verify.failed" : "domain.verify.ok", targetType: "domain", targetId: d.id, diff: { hostname: d.hostname, error } });
  await refresh(ctx, ["/settings/domains"]);
  return error ? { ok: false, error } : { ok: true, message: `ยืนยันโดเมน ${d.hostname} สำเร็จ` };
}

export async function removeDomain(slug: string, domainId: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "admin");
  const db = getAdminDb();
  const [d] = await db
    .select({ id: tenantDomains.id, kind: tenantDomains.kind, hostname: tenantDomains.hostname })
    .from(tenantDomains)
    .where(and(eq(tenantDomains.id, domainId), eq(tenantDomains.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!d) return { ok: false, error: "ไม่พบโดเมน" };
  if (d.kind !== "custom") return { ok: false, error: "ไม่สามารถลบโดเมนย่อยของระบบได้" };
  const hostnames = await tenantHostnames(ctx.tenant.id);
  await db.delete(tenantDomains).where(eq(tenantDomains.id, d.id));
  await invalidateTenant(ctx.tenant.id, hostnames);
  await auditLog({ tenantId: ctx.tenant.id, ...actor(ctx), action: "domain.remove", targetType: "domain", targetId: d.id, diff: { hostname: d.hostname } });
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

async function setOwnStatus(slug: string, status: "active" | "suspended" | "cancelled", action: string, message: string): Promise<ActionResult> {
  const ctx = await getTenantCtx(slug);
  assertRole(ctx, "owner");
  const db = getAdminDb();
  const [cur] = await db.select({ status: tenants.status, trialEndsAt: tenants.trialEndsAt }).from(tenants).where(eq(tenants.id, ctx.tenant.id)).limit(1);
  if (!cur) return { ok: false, error: "ไม่พบร้าน" };
  // re-activating a site that is still inside its trial goes back to "trialing"
  const next = status === "active" && cur.trialEndsAt && cur.trialEndsAt.getTime() > Date.now() ? "trialing" : status;
  await db
    .update(tenants)
    .set({ status: next, suspendedAt: next === "suspended" ? new Date() : null })
    .where(and(eq(tenants.id, ctx.tenant.id), ne(tenants.status, "deleted")));
  await auditLog({ tenantId: ctx.tenant.id, ...actor(ctx), action, targetType: "tenant", targetId: ctx.tenant.id, diff: { from: cur.status, to: next } });
  await refresh(ctx, ["/settings/danger", "/dashboard"]);
  return { ok: true, message };
}

export async function suspendOwnTenant(slug: string) {
  return setOwnStatus(slug, "suspended", "tenant.self.suspend", "ระงับเว็บไซต์ชั่วคราวแล้ว");
}
export async function reactivateOwnTenant(slug: string) {
  return setOwnStatus(slug, "active", "tenant.self.reactivate", "เปิดใช้งานเว็บไซต์อีกครั้งแล้ว");
}
export async function cancelOwnTenant(slug: string) {
  return setOwnStatus(slug, "cancelled", "tenant.self.cancel", "ยกเลิกเว็บไซต์แล้ว");
}
