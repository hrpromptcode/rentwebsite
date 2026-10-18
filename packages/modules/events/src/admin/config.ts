import { and, eq, sql, tenantModules, type DbLike } from "@rentweb/db";
import { eventsConfig, eventsConfigSchema, type EventsConfig } from "../services/config";

export interface AdminEventsConfig {
  events: EventsConfig;
  raw: Record<string, unknown>;
}

/** tenant_modules is a platform table (not RLS-scoped) – read it with the admin connection. */
export async function loadEventsModuleConfig(db: DbLike, tenantId: string): Promise<AdminEventsConfig> {
  const [row] = await db
    .select({ config: tenantModules.config })
    .from(tenantModules)
    .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleKey, "events")))
    .limit(1);
  const raw = (row?.config ?? {}) as Record<string, unknown>;
  return { events: eventsConfig({ events: raw }), raw };
}

/** Merges a patch into moduleConfig.events (upsert). Callers invalidate the tenant runtime cache afterwards. */
export async function saveEventsModuleConfig(db: DbLike, tenantId: string, patch: Partial<EventsConfig>): Promise<EventsConfig> {
  const { raw } = await loadEventsModuleConfig(db, tenantId);
  const next = eventsConfigSchema.parse({ ...raw, ...patch });
  await db
    .insert(tenantModules)
    .values({ tenantId, moduleKey: "events", enabled: true, config: next })
    .onConflictDoUpdate({ target: [tenantModules.tenantId, tenantModules.moduleKey], set: { config: sql`${JSON.stringify(next)}::jsonb` } });
  return next;
}
