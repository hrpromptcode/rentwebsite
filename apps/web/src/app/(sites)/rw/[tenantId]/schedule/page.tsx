import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { Rise } from "@rentweb/storefront";
import { CLASS_LEVELS, LEVEL_LABELS, addDays, bkkDateString, bookingConfig, formatThaiYmd, isClassLevel, listClasses, listInstructors, listTimetable, parseYmd, weekStartOf, ymdToString } from "@rentweb/module-booking/services";
import { FilterPills, INDEX_LABEL, ModuleIntro, WeekTimetable } from "@rentweb/module-booking/ui";
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

const navBtn = "inline-flex size-11 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground";

/**
 * /schedule?week=YYYY-MM-DD&instructor=<slug>&level=<level>&category=<slug>&class=<slug>
 * Weekly timetable (Monday–Sunday) with seats left per session — the "living grid" (§5.8): hover a session to light up the
 * class all week, a live "now" line today, seat meters; desktop columns, mobile day tabs with a sliding pill.
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
    const instructor = sp.instructor ? (instructors.find((i) => i.slug === sp.instructor || i.id === sp.instructor) ?? null) : null;
    const cls = sp.class ? (classes.find((c) => c.slug === sp.class || c.id === sp.class) ?? null) : null;
    const sessions = await listTimetable(tx, tenantId, { from: weekStart, days: 7, config, now, instructorId: instructor?.id ?? null, level, categorySlug: sp.category || null, serviceId: cls?.id ?? null });
    return { classes, instructors: instructors.filter((i) => i.weeklySessions > 0 || i.classes.length > 0), sessions };
  });
  const activeInstructor = sp.instructor ? (instructors.find((i) => i.slug === sp.instructor || i.id === sp.instructor) ?? null) : null;
  const activeClass = sp.class ? (classes.find((c) => c.slug === sp.class || c.id === sp.class) ?? null) : null;
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
      <ModuleIntro
        eyebrow={L.schedule}
        index={`03 / ${INDEX_LABEL.schedule}`}
        title={L.weeklyTimetable}
        className="md:pb-10"
        lead={
          <p data-testid="schedule-summary">
            {formatThaiYmd(weekStart, { short: true })} – {formatThaiYmd(weekEnd, { short: true })} · {sessions.length} รอบ · เปิดรับ {open} รอบ
            {activeClass ? ` · ${activeClass.name}` : ""}
            {activeInstructor ? ` · ${activeInstructor.name}` : ""}
          </p>
        }
      >
        <div className="space-y-4">
          <nav aria-label="เปลี่ยนสัปดาห์" className="flex flex-wrap items-center gap-2">
            {canPrev ? (
              <Link href={href({ week: prevWeek })} scroll={false} aria-label="สัปดาห์ก่อนหน้า" className={navBtn}>
                <ChevronLeft className="size-5" />
              </Link>
            ) : (
              <span aria-disabled aria-label="สัปดาห์ก่อนหน้า" className={cn(navBtn, "pointer-events-none opacity-35")}>
                <ChevronLeft className="size-5" />
              </span>
            )}
            <Link href={href({ week: null })} scroll={false} className={cn("inline-flex h-11 items-center rounded-full px-5 text-sm font-medium transition-colors", weekStart === thisWeek ? "bg-primary text-primary-foreground" : "border border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] hover:border-primary")}>
              สัปดาห์นี้
            </Link>
            {canNext ? (
              <Link href={href({ week: nextWeek })} scroll={false} aria-label="สัปดาห์ถัดไป" className={navBtn}>
                <ChevronRight className="size-5" />
              </Link>
            ) : (
              <span aria-disabled aria-label="สัปดาห์ถัดไป" className={cn(navBtn, "pointer-events-none opacity-35")}>
                <ChevronRight className="size-5" />
              </span>
            )}
          </nav>
          {instructors.length > 1 && (
            <FilterPills
              id="sch-teacher"
              ariaLabel={L.instructors}
              items={[{ href: href({ instructor: null }), label: "ครูทุกคน", active: !activeInstructor }, ...instructors.map((i) => ({ href: href({ instructor: i.slug }), label: i.name, active: activeInstructor?.id === i.id, avatar: i.avatar }))]}
            />
          )}
          {(levels.length > 1 || categories.length > 1) && (
            <FilterPills
              id="sch-level"
              tone="soft"
              ariaLabel={L.level}
              items={[
                ...(levels.length > 1 ? [{ href: href({ level: null }), label: "ทั้งหมด", active: !level }, ...levels.map((lv) => ({ href: href({ level: lv }), label: LEVEL_LABELS[lv], active: level === lv }))] : []),
                ...(categories.length > 1 ? categories.map(([slug, name]) => ({ href: href({ category: activeCategory?.[0] === slug ? null : slug }), label: name, active: activeCategory?.[0] === slug })) : []),
              ]}
            />
          )}
          {activeClass && (
            <p className="text-sm text-muted-foreground">
              แสดงเฉพาะคลาส <span className="font-medium text-foreground">{activeClass.name}</span> ·{" "}
              <Link href={href({ class: null })} className="font-medium text-primary-ink underline-offset-4 hover:underline">
                ดูทุกคลาส
              </Link>
            </p>
          )}
        </div>
      </ModuleIntro>

      <section className="container-x pb-20 md:pb-28">
        <div data-testid="schedule-week">
          {sessions.length === 0 ? (
            <div className="bk-panel flex flex-col items-center gap-4 p-12 text-center">
              <CalendarDays className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">{filtersOn ? "ไม่มีรอบเรียนที่ตรงกับตัวกรองในสัปดาห์นี้" : L.noSessionsThisWeek}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {filtersOn && (
                  <Link href={href({ instructor: null, level: null, category: null, class: null })} className="inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-medium hover:border-primary">
                    ล้างตัวกรอง
                  </Link>
                )}
                {canNext && (
                  <Link href={href({ week: nextWeek })} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
                    สัปดาห์ถัดไป <ChevronRight className="size-4" />
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <WeekTimetable days={days} sessions={sessions} today={today} showPrice />
          )}
        </div>

        <Rise className="mt-14 border-t border-[color-mix(in_oklab,var(--foreground)_12%,transparent)] pt-6 text-sm leading-relaxed text-muted-foreground">
          กดที่รอบเรียนเพื่อสมัคร ระบบจะพาไปยืนยันข้อมูลและชำระเงิน (หรือใช้คลาสพาส) · {L.policy(config.cancelHours)} · จองล่วงหน้าได้สูงสุด {config.maxAdvanceDays} วัน
        </Rise>
      </section>
    </PageBody>
  );
}
