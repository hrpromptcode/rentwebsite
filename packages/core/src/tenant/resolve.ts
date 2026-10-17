import { and, eq } from "drizzle-orm";
import { getDb, tenantDomains, tenants, tenantModules } from "@rentweb/db";
import { cached, getCache } from "../cache";
import { RESERVED_SUBDOMAINS, rootDomain } from "../env";
import type { ModuleKey } from "../modules";
import { resolveTheme, themeToCss, type ResolvedTheme, type ThemeCss } from "../theme";

export type TenantStatus = "trialing" | "active" | "past_due" | "suspended" | "cancelled" | "deleted";

export interface TenantRef {
  id: string;
  slug: string;
  status: TenantStatus;
  planKey: string;
  siteType: string;
}

const HOST_TTL = 300;
const CONFIG_TTL = 60;

export function hostKey(host: string) {
  return `host:${host}`;
}
export function configKey(tenantId: string) {
  return `t:${tenantId}:config`;
}

/** Strips port and lowercases. */
export function normalizeHost(host: string): string {
  return host.toLowerCase().split(":")[0]!.replace(/\.$/, "");
}

/** Returns the tenant slug if `host` is `{slug}.{rootDomain}`. */
export function subdomainOf(host: string): string | null {
  const h = normalizeHost(host);
  const root = rootDomain();
  if (h === root || h === `www.${root}`) return null;
  if (!h.endsWith(`.${root}`)) return null;
  const sub = h.slice(0, -(root.length + 1));
  if (!sub || sub.includes(".")) return null; // only one level deep
  if (RESERVED_SUBDOMAINS.has(sub)) return null;
  return sub;
}

export function isPlatformHost(host: string): boolean {
  const h = normalizeHost(host);
  const root = rootDomain();
  if (h === root || h === `www.${root}`) return true;
  const sub = h.endsWith(`.${root}`) ? h.slice(0, -(root.length + 1)) : null;
  return sub !== null && RESERVED_SUBDOMAINS.has(sub);
}

const NOT_FOUND = { __none: true } as const;

/** hostname → tenant, cached. Null when unknown. */
export async function resolveTenantByHost(host: string): Promise<TenantRef | null> {
  const h = normalizeHost(host);
  const result = await cached<TenantRef | typeof NOT_FOUND>(hostKey(h), HOST_TTL, async () => {
    const db = getDb();
    const sub = subdomainOf(h);
    const cols = { id: tenants.id, slug: tenants.slug, status: tenants.status, planKey: tenants.planKey, siteType: tenants.siteType };
    let row: TenantRef | undefined;
    if (sub) {
      [row] = await db.select(cols).from(tenants).where(eq(tenants.slug, sub)).limit(1);
    }
    if (!row) {
      [row] = await db
        .select(cols)
        .from(tenantDomains)
        .innerJoin(tenants, eq(tenantDomains.tenantId, tenants.id))
        // ADMIN_B2-11: a custom domain serves only after DNS ownership was verified
        .where(and(eq(tenantDomains.hostname, h), eq(tenantDomains.status, "active")))
        .limit(1);
    }
    return row ?? NOT_FOUND;
  });
  return result && "__none" in result ? null : result;
}

export async function invalidateHost(host: string) {
  await getCache().del(hostKey(normalizeHost(host)));
}

export interface TenantConfig {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  planKey: string;
  siteType: string;
  locale: string;
  timezone: string;
  currency: string;
  settings: Record<string, unknown>;
  modules: ModuleKey[];
  moduleConfig: Record<string, Record<string, unknown>>;
  themeRaw: Record<string, unknown>;
}

export async function getTenantConfig(tenantId: string): Promise<TenantConfig | null> {
  const result = await cached<TenantConfig | typeof NOT_FOUND>(configKey(tenantId), CONFIG_TTL, async () => {
    const db = getDb();
    const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!t) return NOT_FOUND;
    const mods = await db.select().from(tenantModules).where(eq(tenantModules.tenantId, tenantId));
    const enabled = mods.filter((m) => m.enabled);
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      planKey: t.planKey,
      siteType: t.siteType,
      locale: t.locale,
      timezone: t.timezone,
      currency: t.currency,
      settings: t.settings ?? {},
      modules: ["cms", ...enabled.map((m) => m.moduleKey as ModuleKey).filter((k) => k !== "cms")],
      moduleConfig: Object.fromEntries(enabled.map((m) => [m.moduleKey, m.config ?? {}])),
      themeRaw: t.theme ?? {},
    };
  });
  return result && "__none" in result ? null : result;
}

export async function invalidateTenant(tenantId: string, hosts: string[] = []) {
  await getCache().del(configKey(tenantId), ...hosts.map((h) => hostKey(normalizeHost(h))));
}

export interface TenantRuntime {
  config: TenantConfig;
  theme: ResolvedTheme;
  css: ThemeCss;
}

export async function getTenantRuntime(tenantId: string): Promise<TenantRuntime | null> {
  const config = await getTenantConfig(tenantId);
  if (!config) return null;
  const theme = resolveTheme(config.themeRaw);
  return { config, theme, css: themeToCss(theme) };
}
