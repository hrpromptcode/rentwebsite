/** Small formatting helpers shared by server and client components (pure). */

import { thb } from "@rentweb/core/money";

export function timeAgoTh(input: Date | string | number, now = Date.now()): string {
  const t = typeof input === "number" ? input : new Date(input).getTime();
  const diff = Math.max(0, Math.floor((now - t) / 1000));
  if (diff < 45) return "เมื่อสักครู่";
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชม.ที่แล้ว`;
  return `${Math.floor(diff / 86400)} วันที่แล้ว`;
}

export function dateTimeTh(input: Date | string | null | undefined): string {
  if (!input) return "-";
  const d = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(d);
}

/** "STEAM-ABCD-EFGH-IJKL" → "STEAM-••••-••••-IJKL" */
export function maskCode(code: string): string {
  const parts = code.split("-");
  if (parts.length >= 3) return parts.map((p, i) => (i === 0 || i === parts.length - 1 ? p : "•".repeat(p.length))).join("-");
  if (code.length <= 4) return "•".repeat(code.length);
  return `${code.slice(0, 2)}${"•".repeat(Math.max(2, code.length - 4))}${code.slice(-2)}`;
}

export type BahtInputResult = { ok: true; satang: number } | { ok: false; error: string };

/** ฿100,000 per wallet top-up (the /wallet server action caps the same). */
export const MAX_WALLET_TOPUP_SATANG = 100_000_00;

/**
 * Parses a typed baht amount ("1,500", "฿ 20.50", Thai digits "๑๐๐") into satang without float drift.
 * Rejects exponents ("1e3"), signs, letters, several dots and more than 2 decimals with a Thai message instead of
 * silently dropping characters.
 */
export function parseBahtInput(raw: string, { max = MAX_WALLET_TOPUP_SATANG }: { max?: number } = {}): BahtInputResult {
  const v = raw
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50))
    .replace(/[\s,฿]/g, "");
  if (!v) return { ok: false, error: "กรุณาระบุจำนวนเงิน" };
  const m = /^(\d{1,9})(?:\.(\d*))?$/.exec(v) ?? /^()\.(\d+)$/.exec(v);
  if (!m) return { ok: false, error: "จำนวนเงินไม่ถูกต้อง ระบุเป็นตัวเลข เช่น 150 หรือ 99.50" };
  const dec = m[2] ?? "";
  if (dec.length > 2) return { ok: false, error: "ระบุทศนิยมได้ไม่เกิน 2 ตำแหน่ง (สตางค์)" };
  const satang = Number(m[1] || "0") * 100 + Number(dec.padEnd(2, "0"));
  if (satang <= 0) return { ok: false, error: "จำนวนเงินต้องมากกว่า 0" };
  if (satang > max) return { ok: false, error: `เติมได้สูงสุด ${thb(max)} ต่อครั้ง` };
  return { ok: true, satang };
}
