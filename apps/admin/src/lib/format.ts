import { thb as coreThb } from "@rentweb/core/money";

export const thb = coreThb;

const TZ = "Asia/Bangkok";

export function fmtDate(d: Date | string | null | undefined, opts: { withTime?: boolean; style?: "short" | "medium" | "long" } = {}): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TZ,
    dateStyle: opts.style ?? "medium",
    ...(opts.withTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

export function fmtRelative(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "เมื่อสักครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  const dd = Math.round(h / 24);
  if (dd < 30) return `${dd} วันที่แล้ว`;
  return fmtDate(date);
}

export function fmtNumber(n: number): string {
  return new Intl.NumberFormat("th-TH").format(n);
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Start of today in Asia/Bangkok as a Date (UTC instant). */
export function startOfTodayBangkok(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  // Bangkok is UTC+7 with no DST
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00+07:00`);
}

export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

/** Absolute URL for a stored asset (local uploads live on the storefront host in dev). */
export function assetUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("/")) return `${process.env.WEB_URL ?? "http://localhost:3000"}${url}`;
  return url;
}

export const TENANT_STATUS_LABEL: Record<string, string> = {
  trialing: "ทดลองใช้",
  active: "ใช้งาน",
  past_due: "ค้างชำระ",
  suspended: "ระงับ",
  cancelled: "ยกเลิก",
  deleted: "ลบแล้ว",
};

export const ROLE_LABEL: Record<string, string> = {
  owner: "เจ้าของ",
  admin: "ผู้ดูแล",
  manager: "ผู้จัดการ",
  staff: "พนักงาน",
  viewer: "ผู้ชม",
};
