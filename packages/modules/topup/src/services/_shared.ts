/** Helpers shared by the top-up services (pure, no React / Next imports). */

/** drizzle `execute()` returns an array on postgres-js and `{ rows }` on PGlite – normalise. */
export function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const rows = (res as { rows?: T[] } | null)?.rows;
  return rows ?? [];
}

export interface TopupModuleConfig {
  walletEnabled: boolean;
  /** bonus credited on top of every wallet top-up, in percent (2 → +2%) */
  walletBonusPercent: number;
  /** minimum wallet top-up in satang */
  minWalletTopup: number;
  otpRequiredFirstOrder: boolean;
  /** anti-fraud: max top-up orders per customer / IP per rolling hour */
  maxOrdersPerHour: number;
}

export const DEFAULT_TOPUP_CONFIG: TopupModuleConfig = {
  walletEnabled: true,
  walletBonusPercent: 0,
  minWalletTopup: 2000,
  otpRequiredFirstOrder: false,
  maxOrdersPerHour: 10,
};

/** Reads `moduleConfig.topup` (as stored on tenant_modules.config) with defaults applied. */
export function topupConfig(raw: Record<string, unknown> | undefined | null): TopupModuleConfig {
  const r = raw ?? {};
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    walletEnabled: bool(r.walletEnabled, DEFAULT_TOPUP_CONFIG.walletEnabled),
    walletBonusPercent: num(r.walletBonusPercent, DEFAULT_TOPUP_CONFIG.walletBonusPercent),
    minWalletTopup: num(r.minWalletTopup, DEFAULT_TOPUP_CONFIG.minWalletTopup),
    otpRequiredFirstOrder: bool(r.otpRequiredFirstOrder, DEFAULT_TOPUP_CONFIG.otpRequiredFirstOrder),
    maxOrdersPerHour: num(r.maxOrdersPerHour, DEFAULT_TOPUP_CONFIG.maxOrdersPerHour),
  };
}

export type TopupOrderStatus = "pending_payment" | "paid" | "processing" | "fulfilled" | "failed" | "refunded" | "cancelled";
export type Fulfillment = "api" | "stock" | "manual";
export type TopupPaymentMethod = "wallet" | "promptpay_qr" | "slip";

/** "1234567890" → "1234****" — used by the public feed / status lookup. */
export function maskPlayerId(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "****";
  if (v.length <= 4) return "****";
  return `${v.slice(0, 4)}****`;
}

export function randomRef(prefix: string, len = 6): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}${out}`;
}
