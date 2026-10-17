import { z } from "zod";

/** moduleConfig.booking as stored on tenant_modules.config – every field has a safe default. */
const bookingSchema = z.object({
  slotMinutes: z.coerce.number().int().min(5).max(240).catch(30),
  minNoticeHours: z.coerce.number().min(0).max(720).catch(1),
  maxAdvanceDays: z.coerce.number().int().min(1).max(365).catch(30),
  cancelHours: z.coerce.number().min(0).max(720).catch(12),
  depositEnabled: z.coerce.boolean().catch(true),
  reminderHours: z.array(z.coerce.number()).catch([24, 2]),
  /** course template: sell class passes (clinic_packages / patient_packages) without the clinic module */
  packages: z.coerce.boolean().catch(false),
  /** prefix of the member number given to pass buyers when the clinic module is off (clinic tenants use clinic.hnPrefix) */
  memberPrefix: z.string().min(1).max(8).catch("ST"),
});

export type BookingConfig = z.output<typeof bookingSchema>;

type ModuleConfigLike = Record<string, Record<string, unknown> | undefined> | null | undefined;

export function bookingConfig(moduleConfig: ModuleConfigLike): BookingConfig {
  const raw = (moduleConfig?.booking ?? {}) as Record<string, unknown>;
  return bookingSchema.parse(raw);
}

/**
 * Packages / class passes are sold when the clinic module is on (clinic courses) or the booking module opted in via
 * moduleConfig.booking.packages (course template). Every /packages route, account page and section uses this gate.
 */
export function packagesEnabled(modules: readonly string[], moduleConfig: ModuleConfigLike): boolean {
  if (!modules.includes("booking") && !modules.includes("clinic")) return false;
  if (modules.includes("clinic")) return true;
  return bookingConfig(moduleConfig).packages;
}

/** Member-number prefix for pass buyers: the clinic's HN prefix, else booking.memberPrefix. */
export function memberNumberPrefix(modules: readonly string[], moduleConfig: ModuleConfigLike): string {
  return modules.includes("clinic") ? clinicConfig(moduleConfig).hnPrefix : bookingConfig(moduleConfig).memberPrefix;
}

const clinicSchema = z.object({
  hnPrefix: z.string().min(1).max(8).catch("HN"),
  consentVersion: z.string().catch("1.0"),
});

export type ClinicConfig = z.output<typeof clinicSchema>;

export function clinicConfig(moduleConfig: ModuleConfigLike): ClinicConfig {
  const raw = (moduleConfig?.clinic ?? {}) as Record<string, unknown>;
  return clinicSchema.parse(raw);
}

export const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed", "checked_in", "in_progress", "completed"] as const;
/** Statuses that free the slot again (mirrors the bookings_no_overlap exclusion constraint). */
export const RELEASED_BOOKING_STATUSES = ["cancelled", "no_show"] as const;
