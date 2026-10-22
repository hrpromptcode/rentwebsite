"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { cn } from "@rentweb/ui/lib/utils";
import type { TimetableSession } from "../services/classes";
import { formatBkkTime, formatThaiYmd, parseYmd, THAI_WEEKDAYS, THAI_WEEKDAYS_SHORT, weekdayOf } from "../services/time";
import { L } from "../labels";

/*
 * Weekly timetable — "living" grid (§5.8): desktop = 7 day columns, mobile = day tabs with a sliding pill + one day's list.
 * Hovering / focusing a session lights up every session of the same class across the week; today's column shows a live
 * "now" line between the sessions (filled after mount: no hydration mismatch). Seats meter per cell. Colours = theme.
 * Pure presentation: sessions come from listTimetable() on the server.
 */

const LEVEL_DOT: Record<string, string> = { beginner: "var(--accent)", intermediate: "var(--primary)", advanced: "var(--foreground)", all: "var(--muted-foreground)" };
const LEVEL_LABEL: Record<string, string> = { beginner: "เริ่มต้น", intermediate: "ระดับกลาง", advanced: "ขั้นสูง", all: "ทุกระดับ" };

function enrolHref(s: TimetableSession) {
  return `/book?service=${encodeURIComponent(s.serviceSlug)}&date=${s.date}&start=${encodeURIComponent(s.start)}`;
}

function seatsLabel(s: TimetableSession) {
  return s.state === "open" ? L.seatsLeft(s.remaining) : s.state === "full" ? L.full : s.state === "past" ? L.past : L.closed;
}

function SessionCell({ s, showPrice, compact, index = 0 }: { s: TimetableSession; showPrice?: boolean; compact?: boolean; index?: number }) {
  const open = s.state === "open";
  const low = open && s.remaining <= Math.max(1, Math.ceil(s.capacity * 0.25));
  const taken = Math.max(0, Math.min(1, (s.capacity - s.remaining) / Math.max(1, s.capacity)));
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="font-accent text-lg leading-none font-semibold tabular-nums">{formatBkkTime(s.start)}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] leading-tight font-semibold tabular-nums",
            open ? (low ? "bg-[color-mix(in_oklab,var(--destructive)_12%,transparent)] text-destructive" : "bg-primary-soft text-primary-ink") : "bg-muted text-muted-foreground",
          )}
        >
          {seatsLabel(s)}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-snug font-medium">{s.serviceName}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        {s.level && (
          <span className="inline-flex items-center gap-1">
            <span className="size-1.5 rounded-full" style={{ background: LEVEL_DOT[s.level] ?? LEVEL_DOT.all }} aria-hidden /> {LEVEL_LABEL[s.level] ?? s.level}
          </span>
        )}
        {s.instructor && <span className="truncate">{s.instructor.name}</span>}
        {!compact && <span>{L.minutes(s.durationMin)}</span>}
        {showPrice && s.price > 0 && <span>฿{Math.round(s.price / 100).toLocaleString("th-TH")}</span>}
      </p>
      <span aria-hidden className="bk-meter mt-2.5 block">
        <i style={{ transform: `scaleX(${s.state === "full" ? 1 : taken})`, opacity: open ? 1 : 0.35 }} />
      </span>
    </>
  );
  const cls = cn(
    "bk-cell bk-pop block rounded-[calc(var(--radius,.75rem)*1.1)] border bg-card p-3 text-left",
    open ? "border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] hover:-translate-y-0.5 focus-visible:-translate-y-0.5" : "border-dashed border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] opacity-60",
  );
  const style = { "--i": index } as React.CSSProperties;
  return open ? (
    <Link href={enrolHref(s)} className={cls} style={style} data-cls={s.serviceSlug} aria-label={`${L.enrol} ${s.serviceName} ${formatBkkTime(s.start)} น. ${seatsLabel(s)}`}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style} data-cls={s.serviceSlug} aria-disabled>
      {body}
    </div>
  );
}

/** "now" marker inside today's list (client only). */
function NowLine({ label }: { label: string }) {
  return (
    <div className="bk-now" role="presentation">
      <span className="absolute -top-2.5 right-0 bg-surface px-1.5 font-mono text-[10px] tracking-[0.08em] text-primary-ink">{label}</span>
    </div>
  );
}

function DayList({ list, today, isToday, nowIso, showPrice, compact, grid }: { list: TimetableSession[]; today: string; isToday: boolean; nowIso: string | null; showPrice?: boolean; compact?: boolean; grid?: string }) {
  void today;
  const nowAt = isToday && nowIso ? list.findIndex((s) => s.start > nowIso) : -1;
  const nowLabel = nowIso ? `ตอนนี้ ${formatBkkTime(nowIso)}` : "";
  return (
    <div className={cn("grid gap-2", grid)}>
      {list.map((s, i) => (
        <React.Fragment key={`${s.serviceId}-${s.start}`}>
          {i === nowAt && <NowLine label={nowLabel} />}
          <SessionCell s={s} showPrice={showPrice} compact={compact} index={i} />
        </React.Fragment>
      ))}
      {isToday && nowIso && nowAt === -1 && list.length > 0 && <NowLine label={nowLabel} />}
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
  const reduce = useReducedMotion();
  const byDay = React.useMemo(() => {
    const m = new Map<string, TimetableSession[]>();
    for (const d of days) m.set(d, []);
    for (const s of sessions) m.get(s.date)?.push(s);
    return m;
  }, [days, sessions]);
  const firstWithSessions = days.find((d) => d >= today && (byDay.get(d)?.length ?? 0) > 0) ?? days.find((d) => d >= today) ?? days[0]!;
  const [active, setActiveRaw] = React.useState(firstWithSessions);
  // the day panel animates only after the visitor switches days (first paint = server HTML, no hydration mismatch)
  const [switched, setSwitched] = React.useState(false);
  const setActive = React.useCallback((d: string) => {
    setSwitched(true);
    setActiveRaw(d);
  }, []);
  React.useEffect(() => setActiveRaw(firstWithSessions), [firstWithSessions]);
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [nowIso, setNowIso] = React.useState<string | null>(null);

  // the "now" line: filled after mount, refreshed every minute
  React.useEffect(() => {
    const tick = () => setNowIso(new Date().toISOString());
    tick();
    const t = window.setInterval(tick, 60_000);
    return () => window.clearInterval(t);
  }, []);

  // phones: the selected day can be the 6th/7th tab (Sat/Sun) – keep it inside the scrollable strip
  React.useEffect(() => {
    const strip = tabsRef.current;
    const tab = strip?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
    if (!strip || !tab) return;
    const left = tab.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft - (strip.clientWidth - tab.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }, [active]);

  // hover / focus a session → light up the same class across the week (DOM attributes only, no re-render)
  const highlight = React.useCallback((slug: string | null) => {
    const root = rootRef.current;
    if (!root) return;
    if (!slug) {
      delete root.dataset.hl;
      root.querySelectorAll("[data-hl-on]").forEach((el) => el.removeAttribute("data-hl-on"));
      return;
    }
    if (root.dataset.hl === slug) return;
    root.dataset.hl = slug;
    root.querySelectorAll<HTMLElement>(".bk-cell").forEach((el) => {
      if (el.dataset.cls === slug) el.setAttribute("data-hl-on", "");
      else el.removeAttribute("data-hl-on");
    });
  }, []);
  const onOver = (e: React.PointerEvent | React.FocusEvent) => {
    if ("pointerType" in e && e.pointerType !== "mouse") return;
    const cell = (e.target as Element).closest<HTMLElement>(".bk-cell");
    highlight(cell?.dataset.cls ?? null);
  };

  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (idx + (e.key === "ArrowRight" ? 1 : -1) + days.length) % days.length;
    setActive(days[next]!);
    tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  };

  return (
    <div ref={rootRef} className={cn("bk-tt", className)} onPointerOver={onOver} onPointerLeave={() => highlight(null)} onFocus={onOver} onBlur={() => highlight(null)}>
      {/* mobile / tablet: day tabs */}
      <div className="lg:hidden">
        <LayoutGroup id="bk-day-tabs">
          <div ref={tabsRef} role="tablist" aria-label="เลือกวัน" className="bk-pills -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2">
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
                  className={cn(
                    "relative flex min-h-14 min-w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-[calc(var(--radius,.75rem)*1.2)] px-3 py-1.5 text-sm transition-colors",
                    isActive ? "text-primary-foreground" : "border border-[color-mix(in_oklab,var(--foreground)_12%,transparent)] bg-card",
                    d === today && !isActive && "border-primary/60",
                  )}
                >
                  {isActive && <motion.span layoutId="day" aria-hidden className="absolute inset-0 rounded-[inherit] bg-primary shadow-[0_12px_28px_-14px_var(--primary)]" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }} />}
                  <span className="relative text-[11px] opacity-80">{THAI_WEEKDAYS_SHORT[weekdayOf(ymd)]}.</span>
                  <span className="relative font-accent text-lg leading-none font-semibold">{ymd.d}</span>
                  <span className={cn("relative mt-0.5 text-[10px]", isActive ? "opacity-85" : "text-muted-foreground")}>{n ? `${n} รอบ` : "–"}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
        {days.map((d) => (
          <div key={d} role="tabpanel" id={`day-panel-${d}`} aria-labelledby={`day-tab-${d}`} hidden={d !== active} className="mt-4">
            {d === active && (
              <motion.div initial={switched && !reduce ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                <p className="mb-3 text-sm font-medium text-muted-foreground">{formatThaiYmd(d, { weekday: true })}</p>
                {(byDay.get(d)?.length ?? 0) === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-[calc(var(--radius,.75rem)*1.4)] border border-dashed p-8 text-center text-sm text-muted-foreground">
                    <CalendarDays className="size-8" /> {L.noSessionsToday}
                  </div>
                ) : (
                  <DayList list={byDay.get(d)!} today={today} isToday={d === today} nowIso={nowIso} showPrice={showPrice} compact={compact} grid="sm:grid-cols-2" />
                )}
              </motion.div>
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
          const past = d < today;
          return (
            <div key={d} className={cn("min-w-0", past && "opacity-60")}>
              <div className={cn("mb-3 flex items-end justify-between border-b pb-2.5", isToday ? "border-primary" : "border-[color-mix(in_oklab,var(--foreground)_12%,transparent)]")}>
                <div>
                  <p className={cn("text-xs", isToday ? "font-semibold text-primary-ink" : "text-muted-foreground")}>{THAI_WEEKDAYS[weekdayOf(ymd)]}</p>
                  <p className="font-accent text-3xl leading-none font-semibold tabular-nums">{ymd.d}</p>
                </div>
                {isToday ? <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">วันนี้</span> : <span className="font-mono text-[10px] text-muted-foreground">{list.length ? `${list.length} รอบ` : ""}</span>}
              </div>
              {list.length === 0 ? (
                <p className="rounded-[calc(var(--radius,.75rem)*1.1)] border border-dashed p-4 text-center text-xs text-muted-foreground">–</p>
              ) : (
                <DayList list={list} today={today} isToday={isToday} nowIso={nowIso} showPrice={showPrice} compact={compact} />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span aria-label="คำอธิบายระดับ" role="note" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {Object.entries(LEVEL_LABEL).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: LEVEL_DOT[k] }} aria-hidden /> {v}
            </span>
          ))}
        </span>
        <span className="hidden lg:inline">· ชี้ที่รอบเรียนเพื่อดูรอบอื่นของคลาสเดียวกันทั้งสัปดาห์</span>
        <Link href="/classes" className="-my-3 inline-flex min-h-11 items-center font-medium text-primary-ink underline-offset-4 hover:underline">
          ดูรายละเอียดคลาส
        </Link>
      </div>
    </div>
  );
}
