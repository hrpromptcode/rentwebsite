/** Pure time helpers shared by server pages and client components (no React, no "use client"). */

export function elapsedMinutes(fromIso: string, now: number): number {
  return Math.max(0, (now - new Date(fromIso).getTime()) / 60_000);
}

/** "0:45", "12:03", "1 ชม. 05 น." */
export function formatElapsed(fromIso: string, now: number): string {
  const sec = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h} ชม. ${String(m).padStart(2, "0")} น.`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Colour by age: green < warn, amber < danger, red after. */
export function elapsedTone(minutes: number, warn = 10, danger = 20): "ok" | "warn" | "danger" {
  if (minutes >= danger) return "danger";
  if (minutes >= warn) return "warn";
  return "ok";
}

const TIME_FMT = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
const DATE_TIME_FMT = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return TIME_FMT.format(new Date(iso));
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return DATE_TIME_FMT.format(new Date(iso));
}

/** Today in Bangkok (YYYY-MM-DD) */
export function todayYmd(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
