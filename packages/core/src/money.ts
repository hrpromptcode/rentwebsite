/** All amounts are integers in satang (1 THB = 100 satang). */

export function formatMoney(satang: number, opts: { currency?: string; locale?: string; compact?: boolean } = {}): string {
  const currency = opts.currency ?? "THB";
  const locale = opts.locale ?? "th-TH";
  const amount = satang / 100;
  const hasFraction = satang % 100 !== 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
    notation: opts.compact ? "compact" : "standard",
  }).format(amount);
}

/** "฿1,290" style without decimals when possible */
export function thb(satang: number): string {
  return formatMoney(satang, { currency: "THB", locale: "th-TH" });
}

export function toSatang(baht: number | string): number {
  const n = typeof baht === "string" ? Number(baht.replace(/[^0-9.-]/g, "")) : baht;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function toBaht(satang: number): number {
  return satang / 100;
}

export function percentOf(satang: number, percent: number): number {
  return Math.round((satang * percent) / 100);
}

export function vat(satang: number, rate = 7): number {
  return percentOf(satang, rate);
}
