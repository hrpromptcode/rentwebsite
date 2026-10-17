import { and, eq, inArray, tenantModules, type DbLike } from "@rentweb/db";
import { enabledMethods, paymentSetupStatus } from "@rentweb/core/payments";
import { bookingDepositMethods } from "../services/bookings";
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

/**
 * ADMIN_B2-04: can the shop actually take the deposits its services ask for? Same rule as createBooking():
 * - `waived`: no deposit method has a receiver (no PromptPay ID / bank account, no cash) — online bookings are
 *   confirmed WITHOUT a deposit and flagged answers.payAtShop ("ชำระที่ร้าน");
 * - `cashOnly`: no online receiver, but cash is on — the customer must bring the deposit in cash before the queue
 *   is confirmed.
 * `ready` = deposits can be paid online (PromptPay QR / bank transfer slip). Only meaningful when deposits are on.
 */
export interface DepositSetupStatus {
  depositsEnabled: boolean;
  ready: boolean;
  waived: boolean;
  cashOnly: boolean;
}

export function depositSetupStatus(settings: Record<string, unknown>, config: Pick<BookingConfig, "depositEnabled">): DepositSetupStatus {
  const ready = paymentSetupStatus(settings).ready;
  const methods = bookingDepositMethods(settings);
  return {
    depositsEnabled: config.depositEnabled,
    ready,
    waived: methods.length === 0,
    cashOnly: !ready && methods.length > 0 && enabledMethods(settings).includes("cash"),
  };
}
