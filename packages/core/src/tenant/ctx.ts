import type { ModuleKey } from "../modules";

export type MemberRole = "owner" | "admin" | "manager" | "staff" | "viewer";

/** Everything a service needs to act on behalf of one tenant. Always the first argument. */
export interface TenantCtx {
  tenantId: string;
  slug: string;
  locale: string;
  timezone: string;
  currency: string;
  modules: ModuleKey[];
  /** acting platform user (admin) if any */
  userId?: string;
  role?: MemberRole | "superadmin";
  permissions: string[];
  /** acting storefront customer if any */
  customerId?: string;
  ip?: string;
  userAgent?: string;
}

const ROLE_RANK: Record<MemberRole | "superadmin", number> = {
  viewer: 0,
  staff: 1,
  manager: 2,
  admin: 3,
  owner: 4,
  superadmin: 5,
};

export function roleAtLeast(role: TenantCtx["role"], min: MemberRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** owner/admin have all permissions; manager has everything but settings/billing; staff needs explicit grants. */
export function hasPermission(ctx: TenantCtx, permission: string): boolean {
  if (ctx.role === "superadmin" || ctx.role === "owner" || ctx.role === "admin") return true;
  if (ctx.role === "manager") return !permission.endsWith(".settings.write") && !permission.startsWith("billing.");
  return ctx.permissions.includes(permission) || ctx.permissions.includes("*");
}

export function hasModule(ctx: TenantCtx, m: ModuleKey): boolean {
  return ctx.modules.includes(m);
}

export class ForbiddenError extends Error {
  status = 403 as const;
  constructor(message = "forbidden") {
    super(message);
  }
}

export class NotFoundError extends Error {
  status = 404 as const;
  constructor(message = "not found") {
    super(message);
  }
}

export function requirePermission(ctx: TenantCtx, permission: string): void {
  if (!hasPermission(ctx, permission)) throw new ForbiddenError(`missing permission ${permission}`);
}

export function requireModule(ctx: TenantCtx, m: ModuleKey): void {
  if (!hasModule(ctx, m)) throw new NotFoundError(`module ${m} not enabled`);
}
