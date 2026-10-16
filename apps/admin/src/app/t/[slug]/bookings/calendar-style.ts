/** Plain .ts (no "use client"): status colours for calendar chips, shared by server and client components. Kept in the
 * admin app so Tailwind generates the classes. */
export const STATUS_CHIP: Record<string, string> = {
  pending: "bg-amber-100 text-amber-950 ring-amber-300 dark:bg-amber-500/20 dark:text-amber-50",
  confirmed: "bg-sky-100 text-sky-950 ring-sky-300 dark:bg-sky-500/20 dark:text-sky-50",
  checked_in: "bg-violet-100 text-violet-950 ring-violet-300 dark:bg-violet-500/20 dark:text-violet-50",
  in_progress: "bg-indigo-200 text-indigo-950 ring-indigo-400 dark:bg-indigo-500/30 dark:text-indigo-50",
  completed: "bg-emerald-100 text-emerald-950 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-50",
  no_show: "bg-rose-50 text-rose-900 ring-rose-200 line-through decoration-rose-400/70 dark:bg-rose-500/10 dark:text-rose-100",
  cancelled: "bg-muted text-muted-foreground ring-border line-through",
};

/** Legend dot per status. */
export const STATUS_DOT: Record<string, string> = {
  pending: "bg-amber-400",
  confirmed: "bg-sky-500",
  checked_in: "bg-violet-500",
  in_progress: "bg-indigo-600",
  completed: "bg-emerald-500",
  no_show: "bg-rose-400",
  cancelled: "bg-muted-foreground/50",
};

export const CALENDAR_STATUS_FILTERS = [
  { key: "", label: "ทุกสถานะ" },
  { key: "active", label: "กำลังจะมาถึง / กำลังให้บริการ" },
  { key: "pending", label: "รอยืนยัน / รอมัดจำ" },
  { key: "confirmed", label: "ยืนยันแล้ว" },
  { key: "checked_in", label: "เช็กอินแล้ว" },
  { key: "in_progress", label: "กำลังให้บริการ" },
  { key: "completed", label: "เสร็จสิ้น" },
  { key: "no_show", label: "ไม่มาตามนัด" },
  { key: "cancelled", label: "ยกเลิกแล้ว" },
  { key: "all", label: "ทั้งหมด (รวมยกเลิก)" },
] as const;

/** Minutes since Bangkok midnight of an instant. */
export function bkkMinutes(d: Date | string): number {
  const t = new Date(typeof d === "string" ? d : d.getTime());
  const b = new Date(t.getTime() + 7 * 3_600_000);
  return b.getUTCHours() * 60 + b.getUTCMinutes();
}

export function hm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
