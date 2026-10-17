import { z } from "zod";

/** moduleConfig.rental (tenant_modules.config) - every field has a safe default. */
export const rentalConfigSchema = z.object({
  /** "14:00" */
  checkInTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).catch("14:00"),
  checkOutTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).catch("12:00"),
  /** free cancellation until N days before check-in (0 = free until the check-in day itself) */
  freeCancelDays: z.coerce.number().int().min(0).max(365).catch(7),
  /** % of the total that confirms the stay; 100 = full payment required, 0 = no online payment (pay on arrival) */
  depositPercent: z.coerce.number().int().min(0).max(100).catch(30),
  /** customers may also choose to pay the full amount online */
  allowFullPayment: z.coerce.boolean().catch(true),
  /** offer "pay at the property" online (requires the tenant's cash method) */
  allowPayAtProperty: z.coerce.boolean().catch(false),
  maxAdvanceDays: z.coerce.number().int().min(7).max(730).catch(365),
  maxNights: z.coerce.number().int().min(1).max(90).catch(30),
  /** minutes an unpaid online stay holds the inventory (payment expiry) */
  holdMinutes: z.coerce.number().int().min(5).max(1440).catch(30),
});

export type RentalConfig = z.output<typeof rentalConfigSchema>;

type ModuleConfigLike = Record<string, Record<string, unknown> | undefined> | null | undefined;

export function rentalConfig(moduleConfig: ModuleConfigLike): RentalConfig {
  const raw = (moduleConfig?.rental ?? {}) as Record<string, unknown>;
  return rentalConfigSchema.parse(raw);
}

/** Stays that hold inventory (pending ones only until holdUntil). */
export const HOLDING_STAY_STATUSES = ["pending", "confirmed", "checked_in"] as const;
export const RELEASED_STAY_STATUSES = ["cancelled", "no_show"] as const;

export type StayStatus = "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
export type StayPaymentStatus = "unpaid" | "deposit_paid" | "paid" | "refunded";
export type ExtraPricing = "per_stay" | "per_night" | "per_guest_night";
export const EXTRA_PRICINGS = ["per_stay", "per_night", "per_guest_night"] as const;
