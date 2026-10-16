import { and, eq, inArray, tenantModules, type DbLike } from "@rentweb/db";
import { bookingConfig, clinicConfig, type BookingConfig, type ClinicConfig } from "../services/config";

export interface AdminModuleConfig {
  booking: BookingConfig;
  clinic: ClinicConfig;
  /** admin-side engine config: no notice period, long horizon (walk-ins are booked "now") */
  adminBooking: BookingConfig;
  raw: Record<string, Record<string, unknown>>;
}

/** tenant_modules is a platform table (not RLS-scoped) – read it with the admin connection. */
export async function loadModuleConfig(db: DbLike, tenantId: string): Promise<AdminModuleConfig> {
  const rows = await db
    .select({ moduleKey: tenantModules.moduleKey, config: tenantModules.config })
    .from(tenantModules)
    .where(and(eq(tenantModules.tenantId, tenantId), inArray(tenantModules.moduleKey, ["booking", "clinic"])));
  const raw = Object.fromEntries(rows.map((r) => [r.moduleKey, (r.config ?? {}) as Record<string, unknown>]));
  const booking = bookingConfig(raw);
  return { booking, clinic: clinicConfig(raw), adminBooking: { ...booking, minNoticeHours: 0, maxAdvanceDays: 365 }, raw };
}
