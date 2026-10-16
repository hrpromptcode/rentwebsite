import "@/modules"; // module payment handlers + sections
import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, getAdminDb, getDb, tenantDomains, tenantMembers, tenantModules, tenants, withTenant, type Tx } from "@rentweb/db";
import { MODULES, resolveModules, type ModuleKey } from "@rentweb/core/modules";
import { rootHost } from "@rentweb/core/env";
import { getSession, isSuperadmin } from "./session";

export type MemberRole = "owner" | "admin" | "manager" | "staff" | "viewer";

export const ROLE_RANK: Record<MemberRole, number> = { owner: 4, admin: 3, manager: 2, staff: 1, viewer: 0 };

export interface TenantCtx {
  tenant: typeof tenants.$inferSelect;
  /** effective role; superadmins who are not members get "owner" with `impersonating = true` */
  role: MemberRole;
  isMember: boolean;
  impersonating: boolean;
  modules: ModuleKey[];
  hostname: string;
  /** http://{slug}.localhost:3000 in dev */
  storefrontUrl: string;
  userId: string;
}

export function storefrontUrlFor(slug: string): string {
  const host = rootHost();
  const proto = host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${slug}.${host}`;
}

/** Loads the tenant by slug and verifies the current user may access its back-office (superadmin bypass). */
export const getTenantCtx = cache(async (slug: string): Promise<TenantCtx> => {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/t/${slug}/dashboard`)}`);
  const db = getAdminDb();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (!tenant || tenant.status === "deleted") notFound();

  const [member] = await db
    .select({ role: tenantMembers.role })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.tenantId, tenant.id), eq(tenantMembers.userId, session.user.id)))
    .limit(1);

  const superadmin = isSuperadmin(session);
  if (!member && !superadmin) notFound();

  const mods = await db.select().from(tenantModules).where(and(eq(tenantModules.tenantId, tenant.id), eq(tenantModules.enabled, true)));
  const modules = resolveModules(mods.map((m) => m.moduleKey));

  return {
    tenant,
    role: (member?.role as MemberRole | undefined) ?? "owner",
    isMember: !!member,
    impersonating: !member && superadmin,
    modules,
    hostname: `${tenant.slug}.${rootHost()}`,
    storefrontUrl: storefrontUrlFor(tenant.slug),
    userId: session.user.id,
  };
});

export function hasRole(ctx: Pick<TenantCtx, "role">, min: MemberRole): boolean {
  return ROLE_RANK[ctx.role] >= ROLE_RANK[min];
}

/** Throws (→ error toast) when the user lacks the minimum role. Use inside server actions. */
export function assertRole(ctx: Pick<TenantCtx, "role">, min: MemberRole) {
  if (!hasRole(ctx, min)) throw new Error("คุณไม่มีสิทธิ์ดำเนินการนี้");
}

/** RLS-scoped transaction for tenant content tables (pages, media, customers, orders…). */
export function tenantTx<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant(getDb(), tenantId, fn);
}

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  siteType: string;
  role: MemberRole;
}

/** Tenants the user belongs to (for the switcher). */
export const listUserTenants = cache(async (userId: string): Promise<TenantSummary[]> => {
  const db = getAdminDb();
  const rows = await db
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name, status: tenants.status, siteType: tenants.siteType, role: tenantMembers.role })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
    .where(eq(tenantMembers.userId, userId))
    .orderBy(asc(tenants.name));
  return rows.filter((r) => r.status !== "deleted").map((r) => ({ ...r, role: r.role as MemberRole }));
});

export async function tenantHostnames(tenantId: string): Promise<string[]> {
  const rows = await getAdminDb().select({ hostname: tenantDomains.hostname }).from(tenantDomains).where(eq(tenantDomains.tenantId, tenantId));
  return rows.map((r) => r.hostname);
}

export function moduleLabel(key: string): string {
  return (MODULES as Record<string, { name: { th: string } }>)[key]?.name.th ?? key;
}
