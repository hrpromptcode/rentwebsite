import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import { CLASS_LEVELS, LEVEL_LABELS, addDays, bkkDateString, bookingConfig, formatThaiYmd, isClassLevel, listClasses, listInstructors, listTimetable, parseYmd, weekStartOf, ymdToString } from "@rentweb/module-booking/services";
import { InstructorAvatar, WeekTimetable } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "booking", "schedule", { title: "ตารางเรียนรายสัปดาห์" }) : {};
}

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ week?: string; instructor?: string; level?: string; category?: string; class?: string }>;

/**
 * /schedule?week=YYYY-MM-DD&instructor=<slug>&level=<level>&category=<slug>&class=<slug>
 * Weekly timetable (Monday–Sunday) with seats left per session; desktop columns, mobile day tabs (WeekTimetable).
 */
export default async function SchedulePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("booking")) return cmsFallback(runtime, "schedule");
  const config = bookingConfig(runtime.config.moduleConfig);
  const now = new Date();
  const today = bkkDateString(now);
  const thisWeek = weekStartOf(today)!;
  const requested = sp.week && parseYmd(sp.week) ? weekStartOf(sp.week) : null;
  const weekStart = requested ?? thisWeek;
  const level = isClassLevel(sp.level) ? sp.level : null;
  const maxDate = ymdToString(addDays(parseYmd(today)!, config.maxAdvanceDays));

  const { classes, instructors, sessions } = await tenantTx(tenantId, async (tx) => {
    const [classes, instructors] = await Promise.all([listClasses(tx, tenantId), listInstructors(tx, tenantId)]);
    const instructor = sp.instructor ? instructors.find((i) => i.slug === sp.instructor || i.id === sp.instructor) ?? null : null;
    const cls = sp.class ? classes.find((c) => c.slug === sp.class || c.id === sp.class) ?? null : null;
    const sessions = await listTimetable(tx, tenantId, { from: weekStart, days: 7, config, now, instructorId: instructor?.id ?? null, level, categorySlug: sp.category || null, serviceId: cls?.id ?? null });
    return { classes, instructors: instructors.filter((i) => i.weeklySessions > 0 || i.classes.length > 0), sessions };
  });
  const activeInstructor = sp.instructor ? instructors.find((i) => i.slug === sp.instructor || i.id === sp.instructor) ?? null : null;
  const activeClass = sp.class ? classes.find((c) => c.slug === sp.class || c.id === sp.class) ?? null : null;
  const categories = [...new Map(classes.filter((c) => c.categorySlug).map((c) => [c.categorySlug!, c.categoryName ?? c.categorySlug!])).entries()];
  const activeCategory = categories.find(([slug]) => slug === sp.category) ?? null;
  const levels = CLASS_LEVELS.filter((lv) => classes.some((c) => c.level === lv));
  const days = Array.from({ length: 7 }, (_, i) => ymdToString(addDays(parseYmd(weekStart)!, i)));
  const weekEnd = days[6]!;

  const href = (next: Partial<{ week: string | null; instructor: string | null; level: string | null; category: string | null; class: string | null }>) => {
    const cur = { week: weekStart === thisWeek ? null : weekStart, instructor: activeInstructor?.slug ?? null, level, category: activeCategory?.[0] ?? null, class: activeClass?.slug ?? null };
    const merged = { ...cur, ...next };
    if (merged.week === thisWeek) merged.week = null;
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/schedule?${s}` : "/schedule";
  };
  const prevWeek = ymdToString(addDays(parseYmd(weekStart)!, -7));
  const nextWeek = ymdToString(addDays(parseYmd(weekStart)!, 7));
  const canPrev = weekStart > thisWeek;
  const canNext = nextWeek <= maxDate;
  const open = sessions.filter((s) => s.state === "open").length;
  const filtersOn = !!(activeInstructor || level || activeCategory || activeClass);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{L.schedule}</p>
            <h1 className="heading-display mt-3 text-4xl font-semibold md:text-6xl">{L.weeklyTimetable}</h1>
            <p className="mt-4 text-muted-foreground" data-testid="schedule-summary">
              {formatThaiYmd(weekStart, { short: true })} – {formatThaiYmd(weekEnd, { short: true })} · {sessions.length} รอบ · เปิดรับ {open} รอบ
              {activeClass ? ` · ${activeClass.name}` : ""}
              {activeInstructor ? ` · ${activeInstructor.name}` : ""}
            </p>
          </div>
          <nav aria-label="เปลี่ยนสัปดาห์" className="flex items-center gap-2">
            <Button asChild={canPrev} variant="outline" size="icon" className="size-11" disabled={!canPrev} aria-label="สัปดาห์ก่อนหน้า">
              {canPrev ? (
                <Link href={href({ week: prevWeek })}>
                  <ChevronLeft className="size-5" />
                </Link>
              ) : (
                <ChevronLeft className="size-5" />
              )}
            </Button>
            <Button asChild variant={weekStart === thisWeek ? "default" : "outline"} className="h-11">
              <Link href={href({ week: null })}>สัปดาห์นี้</Link>
            </Button>
            <Button asChild={canNext} variant="outline" size="icon" className="size-11" disabled={!canNext} aria-label="สัปดาห์ถัดไป">
              {canNext ? (
                <Link href={href({ week: nextWeek })}>
                  <ChevronRight className="size-5" />
                </Link>
              ) : (
                <ChevronRight className="size-5" />
              )}
            </Button>
          </nav>
        </Reveal>

        <Reveal delay={0.05} className="mt-8 space-y-3">
          {instructors.length > 1 && (
            <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              <nav aria-label={L.instructors} className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
                <Chip href={href({ instructor: null })} active={!activeInstructor}>
                  ครูทุกคน
                </Chip>
                {instructors.map((i) => (
                  <Chip key={i.id} href={href({ instructor: i.slug })} active={activeInstructor?.id === i.id} className="pl-1.5">
                    <InstructorAvatar i={i} size="xs" className="mr-2" /> {i.name}
                  </Chip>
                ))}
              </nav>
            </div>
          )}
          {(levels.length > 1 || categories.length > 1) && (
            <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              <nav aria-label={L.level} className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
                {levels.length > 1 && (
                  <>
                    <Chip href={href({ level: null })} active={!level} variant="soft">
                      {L.allLevels}
                    </Chip>
                    {levels.map((lv) => (
                      <Chip key={lv} href={href({ level: lv })} active={level === lv} variant="soft">
                        {LEVEL_LABELS[lv]}
                      </Chip>
                    ))}
                  </>
                )}
                {categories.length > 1 && (
                  <>
                    <span className="mx-1 hidden w-px self-stretch bg-border sm:block" aria-hidden />
                    {categories.map(([slug, name]) => (
                      <Chip key={slug} href={href({ category: activeCategory?.[0] === slug ? null : slug })} active={activeCategory?.[0] === slug} variant="soft">
                        {name}
                      </Chip>
                    ))}
                  </>
                )}
              </nav>
            </div>
          )}
          {activeClass && (
            <p className="text-sm text-muted-foreground">
              แสดงเฉพาะคลาส <span className="font-medium text-foreground">{activeClass.name}</span> ·{" "}
              <Link href={href({ class: null })} className="font-medium text-primary underline-offset-4 hover:underline">
                ดูทุกคลาส
              </Link>
            </p>
          )}
        </Reveal>

        <div className="mt-8" data-testid="schedule-week">
          {sessions.length === 0 ? (
            <div className="card flex flex-col items-center gap-3 p-10 text-center">
              <CalendarDays className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">{filtersOn ? "ไม่มีรอบเรียนที่ตรงกับตัวกรองในสัปดาห์นี้" : L.noSessionsThisWeek}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {filtersOn && (
                  <Button asChild variant="outline" className="h-11">
                    <Link href={href({ instructor: null, level: null, category: null, class: null })}>ล้างตัวกรอง</Link>
                  </Button>
                )}
                {canNext && (
                  <Button asChild className="h-11">
                    <Link href={href({ week: nextWeek })}>
                      สัปดาห์ถัดไป <ChevronRight className="size-4" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <WeekTimetable days={days} sessions={sessions} today={today} showPrice />
          )}
        </div>

        <Reveal className="mt-10 rounded-[var(--radius-xl)] bg-muted/60 p-6 text-sm text-muted-foreground">
          กดที่รอบเรียนเพื่อสมัคร ระบบจะพาไปยืนยันข้อมูลและชำระเงิน (หรือใช้คลาสพาส) · {L.policy(config.cancelHours)} · จองล่วงหน้าได้สูงสุด {config.maxAdvanceDays} วัน
        </Reveal>
      </section>
    </PageBody>
  );
}

function Chip({ href, active, children, variant = "solid", className }: { href: string; active: boolean; children: React.ReactNode; variant?: "solid" | "soft"; className?: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition",
        active ? (variant === "solid" ? "border-primary bg-primary text-primary-foreground" : "border-primary bg-primary-soft text-primary-ink") : "border-border bg-card text-foreground hover:border-primary/60 hover:text-primary",
        className,
      )}
    >
      {children}
    </Link>
  );
}
