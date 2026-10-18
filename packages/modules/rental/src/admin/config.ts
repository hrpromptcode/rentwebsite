import { and, eq, sql, tenantModules, type DbLike } from "@rentweb/db";
import { rentalConfig, rentalConfigSchema, type RentalConfig } from "../services/config";

export interface AdminRentalConfig {
  rental: RentalConfig;
  raw: Record<string, unknown>;
}

/** tenant_modules is a platform table (not RLS-scoped) – read it with the admin connection. */
export async function loadRentalModuleConfig(db: DbLike, tenantId: string): Promise<AdminRentalConfig> {
  const [row] = await db
    .select({ config: tenantModules.config })
    .from(tenantModules)
    .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleKey, "rental")))
    .limit(1);
  const raw = (row?.config ?? {}) as Record<string, unknown>;
  return { rental: rentalConfig({ rental: raw }), raw };
}

/**
 * Merges a settings patch into moduleConfig.rental (upsert: a tenant that enabled the module without a config row gets one).
 * Callers invalidate the tenant runtime cache afterwards so the storefront sees the new policy.
 */
export async function saveRentalModuleConfig(db: DbLike, tenantId: string, patch: Partial<RentalConfig>): Promise<RentalConfig> {
  const { raw } = await loadRentalModuleConfig(db, tenantId);
  const next = rentalConfigSchema.parse({ ...raw, ...patch });
  await db
    .insert(tenantModules)
    .values({ tenantId, moduleKey: "rental", enabled: true, config: next })
    .onConflictDoUpdate({ target: [tenantModules.tenantId, tenantModules.moduleKey], set: { config: sql`${JSON.stringify(next)}::jsonb` } });
  return next;
}
