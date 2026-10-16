/** Normalised moduleConfig.restaurant with defaults. Amounts in satang. */
export interface RestaurantConfig {
  serviceChargePercent: number;
  dineIn: boolean;
  pickup: boolean;
  delivery: boolean;
  /** deposit per reservation in satang (0 = none) */
  reservationDeposit: number;
  prepMinutesDefault: number;
  /** minutes a reservation blocks a table */
  reservationMinutes: number;
  /** minimum lead time for pickup orders */
  pickupLeadMinutes: number;
  /** how far ahead guests may reserve online (days, Bangkok calendar) */
  reservationMaxAdvanceDays: number;
  /** a table session without a new order for this long is not reused by the next QR scan (SBR-006) */
  tableSessionIdleMinutes: number;
  /** hard cap on a table session's age in hours (SBR-006) */
  tableSessionMaxHours: number;
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

export function restaurantConfig(moduleConfig: Record<string, unknown> | undefined | null): RestaurantConfig {
  const c = moduleConfig ?? {};
  return {
    serviceChargePercent: Math.max(0, num(c.serviceChargePercent, 0)),
    dineIn: bool(c.dineIn, true),
    pickup: bool(c.pickup, true),
    delivery: bool(c.delivery, false),
    reservationDeposit: Math.max(0, Math.round(num(c.reservationDeposit, 0))),
    prepMinutesDefault: num(c.prepMinutesDefault, 15),
    reservationMinutes: num(c.reservationMinutes, 90),
    pickupLeadMinutes: num(c.pickupLeadMinutes, 20),
    reservationMaxAdvanceDays: Math.max(1, Math.round(num(c.reservationMaxAdvanceDays, 60))),
    tableSessionIdleMinutes: Math.max(30, num(c.tableSessionIdleMinutes, 240)),
    tableSessionMaxHours: Math.max(1, num(c.tableSessionMaxHours, 12)),
  };
}

/** moduleConfig lives on TenantConfig.moduleConfig[module]; helper for pages/sections. */
export function restaurantConfigOf(tenant: { moduleConfig?: Record<string, Record<string, unknown>> }): RestaurantConfig {
  return restaurantConfig(tenant.moduleConfig?.restaurant);
}
