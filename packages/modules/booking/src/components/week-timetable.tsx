"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import type { TimetableSession } from "../services/classes";
import { formatBkkTime, formatThaiYmd, parseYmd, THAI_WEEKDAYS, THAI_WEEKDAYS_SHORT, weekdayOf } from "../services/time";
import { L } from "../labels";

/*
 * Weekly timetable: desktop = 7 day columns side by side, mobile = day tabs + one day's list.
 * Pure presentation: sessions come from listTimetable() on the server.
 */

const LEVEL_DOT: Record<string, string> = { beginner: "bg-emerald-500", intermediate: "bg-amber-500", advanced: "bg-rose-500", all: "bg-primary" };
const LEVEL_LABEL: Record<string, string> = { beginner: "เริ่มต้น", intermediate: "ระดับกลาง", advanced: "ขั้นสูง", all: "ทุกระดับ" };

function enrolHref(s: TimetableSession) {
  return `/book?service=${encodeURIComponent(s.serviceSlug)}&date=${s.date}&start=${encodeURIComponent(s.start)}`;
}

function seatsLabel(s: TimetableSession) {
  return s.state === "open" ? L.seatsLeft(s.remaining) : s.state === "full" ? L.full : s.state === "past" ? L.past : L.closed;
}

function SessionCell({ s, showPrice, compact }: { s: TimetableSession; showPrice?: boolean; compact?: boolean }) {
  const open = s.state === "open";
  const low = open && s.remaining <= Math.max(1, Math.ceil(s.capacity * 0.25));
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-base font-semibold tabular-nums">{formatBkkTime(s.start)}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", open ? (low ? "bg-amber-500/15 text-amber-900 dark:text-amber-200" : "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200") : "bg-muted text-muted-foreground")}>{seatsLabel(s)}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug">{s.serviceName}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        {s.level && (
          <span className="inline-flex items-center gap-1">
            <span className={cn("size-1.5 rounded-full", LEVEL_DOT[s.level] ?? LEVEL_DOT.all)} aria-hidden /> {LEVEL_LABEL[s.level] ?? s.level}
          </span>
        )}
        {s.instructor && <span className="truncate">{s.instructor.name}</span>}
        {!compact && <span>{L.minutes(s.durationMin)}</span>}
        {showPrice && s.price > 0 && <span>฿{Math.round(s.price / 100).toLocaleString("th-TH")}</span>}
      </p>
    </>
  );
  const cls = cn("block rounded-[var(--radius-lg)] border bg-card p-3 text-left transition", open ? "hover:-translate-y-0.5 hover:border-primary hover:shadow-md" : "border-dashed opacity-70");
  return open ? (
    <Link href={enrolHref(s)} className={cls} aria-label={`${L.enrol} ${s.serviceName} ${formatBkkTime(s.start)} น. ${seatsLabel(s)}`}>
      {body}
    </Link>
  ) : (
    <div className={cls} aria-disabled>
      {body}
    </div>
  );
}

export interface WeekTimetableProps {
  /** YYYY-MM-DD, in display order */
  days: string[];
  sessions: TimetableSession[];
  today: string;
  showPrice?: boolean;
  /** tighter cells (home-page section) */
  compact?: boolean;
  className?: string;
}

export function WeekTimetable({ days, sessions, today, showPrice, compact, className }: WeekTimetableProps) {
  const byDay = React.useMemo(() => {
    const m = new Map<string, TimetableSession[]>();
    for (const d of days) m.set(d, []);
    for (const s of sessions) m.get(s.date)?.push(s);
    return m;
  }, [days, sessions]);
  const firstWithSessions = days.find((d) => d >= today && (byDay.get(d)?.length ?? 0) > 0) ?? days.find((d) => d >= today) ?? days[0]!;
  const [active, setActive] = React.useState(firstWithSessions);
  React.useEffect(() => setActive(firstWithSessions), [firstWithSessions]);
  const tabsRef = React.useRef<HTMLDivElement>(null);

  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (idx + (e.key === "ArrowRight" ? 1 : -1) + days.length) % days.length;
    setActive(days[next]!);
    (tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next])?.focus();
  };

  return (
    <div className={className}>
      {/* mobile / tablet: day tabs */}
      <div className="lg:hidden">
        <div ref={tabsRef} role="tablist" aria-label="เลือกวัน" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2">
          {days.map((d, i) => {
            const ymd = parseYmd(d)!;
            const n = byDay.get(d)?.length ?? 0;
            const isActive = d === active;
            return (
              <button
                key={d}
                role="tab"
                id={`day-tab-${d}`}
                aria-selected={isActive}
                aria-controls={`day-panel-${d}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActive(d)}
                onKeyDown={(e) => onKey(e, i)}
                className={cn("flex min-h-11 min-w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-[var(--radius-lg)] border px-3 py-1.5 text-sm transition", isActive ? "border-primary bg-primary text-primary-foreground shadow-md" : "bg-card hover:border-primary/50", d === today && !isActive && "border-primary/60")}
              >
                <span className="text-[11px] opacity-80">{THAI_WEEKDAYS_SHORT[weekdayOf(ymd)]}.</span>
                <span className="font-heading text-base font-semibold leading-none">{ymd.d}</span>
                <span className={cn("mt-0.5 text-[10px]", isActive ? "opacity-80" : "text-muted-foreground")}>{n ? `${n} รอบ` : "–"}</span>
              </button>
            );
          })}
        </div>
        {days.map((d) => (
          <div key={d} role="tabpanel" id={`day-panel-${d}`} aria-labelledby={`day-tab-${d}`} hidden={d !== active} className="mt-3">
            <p className="mb-3 text-sm font-medium text-muted-foreground">{formatThaiYmd(d, { weekday: true })}</p>
            {(byDay.get(d)?.length ?? 0) === 0 ? (
              <div className="card flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <CalendarDays className="size-8" /> {L.noSessionsToday}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {byDay.get(d)!.map((s) => (
                  <SessionCell key={`${s.serviceId}-${s.start}`} s={s} showPrice={showPrice} compact={compact} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* desktop: columns */}
      <div className="hidden lg:grid lg:gap-3" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d) => {
          const ymd = parseYmd(d)!;
          const list = byDay.get(d) ?? [];
          const isToday = d === today;
          return (
            <div key={d} className="min-w-0">
              <div className={cn("mb-3 rounded-[var(--radius-lg)] px-3 py-2 text-center", isToday ? "bg-primary text-primary-foreground" : "bg-muted")}>
                <p className="text-xs opacity-80">{THAI_WEEKDAYS[weekdayOf(ymd)]}</p>
                <p className="font-heading text-xl font-semibold leading-tight">{ymd.d}</p>
                {isToday && <p className="text-[11px] font-medium">วันนี้</p>}
              </div>
              {list.length === 0 ? (
                <p className="rounded-[var(--radius-lg)] border border-dashed p-4 text-center text-xs text-muted-foreground">–</p>
              ) : (
                <div className="grid gap-2">
                  {list.map((s) => (
                    <SessionCell key={`${s.serviceId}-${s.start}`} s={s} showPrice={showPrice} compact={compact} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="คำอธิบายระดับ">
        {Object.entries(LEVEL_LABEL).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", LEVEL_DOT[k])} aria-hidden /> {v}
          </span>
        ))}
        <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
          <Link href="/classes">ดูรายละเอียดคลาส</Link>
        </Button>
      </p>
    </div>
  );
}
