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
  };
}

/** moduleConfig lives on TenantConfig.moduleConfig[module]; helper for pages/sections. */
export function restaurantConfigOf(tenant: { moduleConfig?: Record<string, Record<string, unknown>> }): RestaurantConfig {
  return restaurantConfig(tenant.moduleConfig?.restaurant);
}
