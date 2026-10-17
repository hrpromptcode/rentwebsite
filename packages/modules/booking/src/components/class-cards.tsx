import * as React from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock, Sparkles, UserRound, Users } from "lucide-react";
import { Badge } from "@rentweb/ui/components/badge";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { Img } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import type { ClassInstructor, ClassItem, TimetableSession } from "../services/classes";
import { levelLabel } from "../services/classes";
import { formatBkkTime, formatThaiYmd, THAI_WEEKDAYS, THAI_WEEKDAYS_SHORT } from "../services/time";
import { L } from "../labels";

/* Server-safe presentational pieces for classes, instructors and timetable sessions (course template). */

const LEVEL_TONE: Record<string, string> = {
  beginner: "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
  intermediate: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
  advanced: "bg-rose-500/15 text-rose-900 dark:text-rose-200",
  all: "bg-primary-soft text-primary-ink",
};

export function LevelBadge({ level, className }: { level: string | null | undefined; className?: string }) {
  const label = levelLabel(level);
  if (!label) return null;
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", LEVEL_TONE[level!] ?? LEVEL_TONE.all, className)}>{label}</span>;
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

export function ClassCard({ c, className, variant = "card" }: { c: ClassItem; className?: string; variant?: "card" | "editorial" }) {
  const href = `/classes/${c.slug}`;
  const lead = c.instructors[0] ?? c.sessions.find((s) => s.instructor)?.instructor ?? null;
  if (variant === "editorial") {
    return (
      <article className={cn("card group grid h-full overflow-hidden p-0 transition hover:-translate-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]", className)}>
        <Link href={href} className="relative block aspect-[4/3] overflow-hidden sm:aspect-auto sm:h-full">
          {c.image ? <Img src={c.image} alt={c.name} className="size-full object-cover transition duration-700 group-hover:scale-105" /> : <div className="flex size-full items-center justify-center bg-primary-soft text-primary"><Sparkles className="size-8" /></div>}
          <LevelBadge level={c.level} className="absolute top-3 left-3 bg-background/95 backdrop-blur" />
        </Link>
        <div className="flex flex-col p-6">
          {c.categoryName && <p className="text-xs font-semibold tracking-[0.18em] text-primary-ink uppercase">{c.categoryName}</p>}
          <Link href={href} className="mt-1 inline-flex min-h-11 items-center font-heading text-2xl font-semibold leading-tight hover:text-primary">
            {c.name}
          </Link>
          {c.description && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{c.description.split(/\n/)[0]}</p>}
          <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <div className="inline-flex items-center gap-1.5 text-muted-foreground"><Clock className="size-4 text-primary" /> {L.minutes(c.durationMin)}</div>
            <div className="inline-flex items-center gap-1.5 text-muted-foreground"><Users className="size-4 text-primary" /> สูงสุด {c.capacity} คน</div>
            {c.sessions.length > 0 && <div className="inline-flex items-center gap-1.5 text-muted-foreground"><CalendarDays className="size-4 text-primary" /> {weeklyRhythm(c.sessions, 3)}</div>}
          </dl>
          <div className="mt-auto flex items-end justify-between gap-3 pt-5">
            <div>
              {lead && (
                <p className="mb-2 flex items-center gap-2 text-sm">
                  <InstructorAvatar i={lead} size="xs" /> <span className="text-muted-foreground">{L.instructor}</span> <span className="font-medium">{lead.name}</span>
                </p>
              )}
              <p className="font-heading text-xl font-semibold">{c.price === 0 ? c.priceNote || L.free : `${thb(c.price)} `}<span className="text-sm font-normal text-muted-foreground">{c.price > 0 ? `/ ${L.perClass}` : ""}</span></p>
            </div>
            <Button asChild size="sm" className="min-h-11">
              <Link href={href}>
                {L.enrol} <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </article>
    );
  }
  return (
    <article className={cn("card group flex h-full flex-col overflow-hidden p-0 transition hover:-translate-y-1", className)}>
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden">
        {c.image ? <Img src={c.image} alt={c.name} className="size-full object-cover transition duration-700 group-hover:scale-105" /> : <div className="flex size-full items-center justify-center bg-primary-soft text-primary"><Sparkles className="size-8" /></div>}
        <LevelBadge level={c.level} className="absolute top-3 left-3 bg-background/95 backdrop-blur" />
        {c.featured && (
          <Badge className="absolute top-3 right-3" variant="default">
            แนะนำ
          </Badge>
        )}
        <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur">
          <Clock className="size-3" /> {L.minutes(c.durationMin)}
        </span>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        {c.categoryName && <p className="mb-1 text-xs font-semibold tracking-[0.15em] text-primary-ink uppercase">{c.categoryName}</p>}
        <Link href={href} className="inline-flex min-h-11 items-center font-heading text-lg font-semibold leading-snug hover:text-primary">
          {c.name}
        </Link>
        {c.sessions.length > 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" /> <span className="truncate">{weeklyRhythm(c.sessions, 3)}</span>
          </p>
        )}
        {lead && (
          <p className="mt-3 flex items-center gap-2 text-sm">
            <InstructorAvatar i={lead} size="xs" /> <span className="truncate">{lead.name}</span>
            {c.instructors.length > 1 && <span className="text-xs text-muted-foreground">+{c.instructors.length - 1}</span>}
          </p>
        )}
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <p className="font-heading text-xl font-semibold">{c.price === 0 ? c.priceNote || L.free : thb(c.price)}</p>
            <p className="text-xs text-muted-foreground">
              {c.price > 0 ? `${L.perClass} · ` : ""}สูงสุด {c.capacity} คน
            </p>
          </div>
          <Button asChild size="sm" className="min-h-11">
            <Link href={href}>{L.enrol}</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

export function InstructorCard({ i, classes, weeklySessions, className }: { i: ClassInstructor & { bio?: string | null }; classes?: Array<{ slug: string; name: string }>; weeklySessions?: number; className?: string }) {
  return (
    <div className={cn("card group flex h-full flex-col items-center p-6 text-center transition hover:-translate-y-1", className)}>
      <Link href={`/instructors/${i.slug}`} aria-label={i.name} className="relative">
        {i.avatar ? (
          <Img src={i.avatar} alt={i.name} className="size-28 rounded-full object-cover ring-4 ring-background shadow-lg transition duration-500 group-hover:scale-105" />
        ) : (
          <span className="flex size-28 items-center justify-center rounded-full text-white shadow-lg" style={{ background: i.color }}>
            <UserRound className="size-10" />
          </span>
        )}
        <span aria-hidden className="absolute right-1 bottom-1 size-4 rounded-full border-2 border-background" style={{ background: i.color }} />
      </Link>
      <Link href={`/instructors/${i.slug}`} className="mt-3 inline-flex min-h-11 items-center font-heading text-lg font-semibold hover:text-primary">
        {i.name}
      </Link>
      {i.title && <p className="mt-0.5 text-sm text-primary">{i.title}</p>}
      {i.bio && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{i.bio}</p>}
      {classes && classes.length > 0 && (
        <ul className="mt-3 flex flex-wrap justify-center gap-1.5">
          {classes.slice(0, 3).map((c) => (
            <li key={c.slug}>
              <Link href={`/classes/${c.slug}`} className="inline-flex min-h-8 items-center rounded-full bg-muted px-2.5 text-xs font-medium hover:bg-primary-soft hover:text-primary">
                {c.name}
              </Link>
            </li>
          ))}
          {classes.length > 3 && <li className="inline-flex min-h-8 items-center text-xs text-muted-foreground">+{classes.length - 3}</li>}
        </ul>
      )}
      {typeof weeklySessions === "number" && weeklySessions > 0 && <p className="mt-2 text-xs text-muted-foreground">{weeklySessions} รอบ/สัปดาห์</p>}
      <Button asChild variant="outline" size="sm" className="mt-5 min-h-11">
        <Link href={`/schedule?instructor=${encodeURIComponent(i.slug)}`}>
          <CalendarDays className="size-4" /> ดูตารางสอน
        </Link>
      </Button>
    </div>
  );
}

/** Link to the wizard with the session preselected (date + start). */
export function enrolHref(s: Pick<TimetableSession, "serviceSlug" | "date" | "start">): string {
  return `/book?service=${encodeURIComponent(s.serviceSlug)}&date=${s.date}&start=${encodeURIComponent(s.start)}`;
}

export function SeatsPill({ s, className }: { s: Pick<TimetableSession, "remaining" | "capacity" | "state">; className?: string }) {
  const tone = s.state === "open" ? (s.remaining <= Math.max(1, Math.ceil(s.capacity * 0.25)) ? "bg-amber-500/15 text-amber-900 dark:text-amber-200" : "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200") : "bg-muted text-muted-foreground";
  const label = s.state === "open" ? L.seatsLeft(s.remaining) : s.state === "full" ? L.full : s.state === "past" ? L.past : L.closed;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums", tone, className)}>{label}</span>;
}

/** One timetable row (schedule page, class detail, account). */
export function SessionRow({ s, showDate, showPrice, className }: { s: TimetableSession; showDate?: boolean; showPrice?: boolean; className?: string }) {
  const bookable = s.state === "open";
  return (
    <div className={cn("card flex items-center gap-3 p-3 transition sm:gap-4 sm:p-4", bookable && "hover:-translate-y-0.5 hover:border-primary/50", !bookable && "opacity-80", className)}>
      <div className="flex w-16 shrink-0 flex-col items-center rounded-[var(--radius-lg)] bg-primary-soft py-2 text-primary">
        {showDate && <span className="text-[11px]">{THAI_WEEKDAYS_SHORT[new Date(s.start).getUTCDay() /* placeholder, replaced below */]}</span>}
        <span className="font-heading text-lg font-semibold leading-none tabular-nums">{formatBkkTime(s.start)}</span>
        <span className="mt-0.5 text-[11px]">{L.minutes(s.durationMin)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/classes/${s.serviceSlug}`} className="inline-flex min-h-6 items-center font-medium hover:text-primary">
            {s.serviceName}
          </Link>
          <LevelBadge level={s.level} />
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
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <SeatsPill s={s} />
        {bookable ? (
          <Button asChild size="sm" className="min-h-11">
            <Link href={enrolHref(s)}>{L.enrol}</Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="min-h-11" disabled>
            {L.enrol}
          </Button>
        )}
      </div>
    </div>
  );
}

export { THAI_WEEKDAYS };
