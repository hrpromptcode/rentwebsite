import * as React from "react";
import Link from "next/link";
import { ArrowRight, UserRound } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { Img } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import type { ClassInstructor, ClassItem, TimetableSession } from "../services/classes";
import { levelLabel } from "../services/classes";
import { formatBkkTime, formatThaiYmd, parseYmd, THAI_WEEKDAYS, THAI_WEEKDAYS_SHORT, weekdayOf } from "../services/time";
import { L } from "../labels";

/* Server-safe presentational primitives for classes, instructors and timetable sessions (course template).
   Colours are theme tokens only: a level is a coloured dot (accent / primary / foreground) on a neutral chip. */

/** level → dot colour (theme tokens; tenants recolour levels with their palette) */
export const LEVEL_DOT_VAR: Record<string, string> = {
  beginner: "var(--accent)",
  intermediate: "var(--primary)",
  advanced: "var(--foreground)",
  all: "var(--muted-foreground)",
};

export function LevelBadge({ level, className }: { level: string | null | undefined; className?: string }) {
  const label = levelLabel(level);
  if (!label) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--foreground)_12%,transparent)] px-2.5 py-1 text-xs font-semibold text-foreground", className)}>
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: LEVEL_DOT_VAR[level!] ?? LEVEL_DOT_VAR.all }} />
      {label}
    </span>
  );
}

/** "จ. 07:30 · พ. 18:30" – compact weekly rhythm of a class. */
export function weeklyRhythm(sessions: ClassItem["sessions"], max = 4): string {
  const parts = sessions.slice(0, max).map((s) => `${THAI_WEEKDAYS_SHORT[s.weekday]}. ${s.startTime}`);
  return parts.join(" · ") + (sessions.length > max ? ` +${sessions.length - max}` : "");
}

export function InstructorAvatar({ i, size = "sm", className }: { i: ClassInstructor; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const px = size === "xs" ? "size-6" : size === "sm" ? "size-8" : size === "md" ? "size-12" : "size-28";
  return i.avatar ? (
    <Img src={i.avatar} alt={i.name} className={cn(px, "shrink-0 rounded-full object-cover ring-2 ring-background", className)} />
  ) : (
    <span className={cn(px, "flex shrink-0 items-center justify-center rounded-full text-white ring-2 ring-background", className)} style={{ background: i.color }} aria-hidden>
      <UserRound className={size === "lg" ? "size-10" : "size-4"} />
    </span>
  );
}

/** Link to the wizard with the session preselected (date + start). */
export function enrolHref(s: Pick<TimetableSession, "serviceSlug" | "date" | "start">): string {
  return `/book?service=${encodeURIComponent(s.serviceSlug)}&date=${s.date}&start=${encodeURIComponent(s.start)}`;
}

export function seatsTone(s: Pick<TimetableSession, "remaining" | "capacity" | "state">): "open" | "low" | "off" {
  if (s.state !== "open") return "off";
  return s.remaining <= Math.max(1, Math.ceil(s.capacity * 0.25)) ? "low" : "open";
}

export const SEATS_TONE_CLASS = {
  open: "bg-primary-soft text-primary-ink",
  low: "bg-[color-mix(in_oklab,var(--destructive)_12%,transparent)] text-destructive",
  off: "bg-muted text-muted-foreground",
} as const;

export function SeatsPill({ s, className }: { s: Pick<TimetableSession, "remaining" | "capacity" | "state">; className?: string }) {
  const label = s.state === "open" ? L.seatsLeft(s.remaining) : s.state === "full" ? L.full : s.state === "past" ? L.past : L.closed;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums", SEATS_TONE_CLASS[seatsTone(s)], className)}>{label}</span>;
}

/** Seats taken vs capacity as a thin meter (decorative; the pill says it in words). */
export function SeatMeter({ s, className }: { s: Pick<TimetableSession, "remaining" | "capacity" | "state">; className?: string }) {
  const taken = Math.max(0, Math.min(1, (s.capacity - s.remaining) / Math.max(1, s.capacity)));
  return (
    <span aria-hidden className={cn("bk-meter block", className)}>
      <i style={{ transform: `scaleX(${s.state === "full" ? 1 : taken})`, opacity: s.state === "open" ? 1 : 0.35 }} />
    </span>
  );
}

/** One timetable row (class detail, instructor page): big time, class, instructor, seats + "สมัครเรียน". */
export function SessionRow({ s, showDate, showPrice, className }: { s: TimetableSession; showDate?: boolean; showPrice?: boolean; className?: string }) {
  const bookable = s.state === "open";
  const ymd = parseYmd(s.date) ?? { y: 1970, m: 1, d: 1 };
  return (
    <div className={cn("group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] py-4 transition-colors", bookable ? "hover:bg-[color-mix(in_oklab,var(--primary-soft)_60%,transparent)]" : "opacity-70", className)}>
      <div className="flex w-[4.5rem] flex-col">
        {showDate && (
          <span className="text-[0.6875rem] font-medium text-muted-foreground">
            {THAI_WEEKDAYS_SHORT[weekdayOf(ymd)]}. {ymd.d}
          </span>
        )}
        <span className="font-accent text-2xl leading-none font-semibold tabular-nums">{formatBkkTime(s.start)}</span>
        <span className="mt-1 text-[0.6875rem] text-muted-foreground">{L.minutes(s.durationMin)}</span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/classes/${s.serviceSlug}`} className="inline-flex min-h-6 items-center font-medium hover:text-primary-ink">
            {s.serviceName}
          </Link>
          <LevelBadge level={s.level} className="py-0.5" />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {showDate && <span>{formatThaiYmd(s.date, { weekday: true, short: true })}</span>}
          {s.instructor && (
            <span className="inline-flex items-center gap-1.5">
              <InstructorAvatar i={s.instructor} size="xs" /> {s.instructor.name}
            </span>
          )}
          {showPrice && s.price > 0 && <span>{thb(s.price)}</span>}
        </p>
        <SeatMeter s={s} className="mt-2 max-w-40" />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <SeatsPill s={s} />
        {bookable ? (
          <Link href={enrolHref(s)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-transform duration-300 hover:-translate-y-0.5 active:scale-[.97]">
            {L.enrol} <ArrowRight className="size-4" />
          </Link>
        ) : (
          <span aria-disabled className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm text-muted-foreground">
            {L.enrol}
          </span>
        )}
      </div>
    </div>
  );
}

export { THAI_WEEKDAYS };
