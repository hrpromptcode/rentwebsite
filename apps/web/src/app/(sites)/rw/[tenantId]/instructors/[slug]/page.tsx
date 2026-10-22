import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, ChevronRight } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { CtaButton, Eyebrow, Prose, RevealHeading, Rise, SectionStyles, StaggerCell, StaggerList } from "@rentweb/storefront";
import { bkkDateString, bookingConfig, getInstructorBySlug, listClasses, listTimetable } from "@rentweb/module-booking/services";
import { BookingStyles, ClassStudioCard, Portrait, SessionRow, lookOf, titleStep, nameLines } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { decodeSlug } from "@/lib/slug";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const i = await tenantTx(tenantId, (tx) => getInstructorBySlug(tx, tenantId, slug));
  return i ? { title: i.name, description: i.bio ?? i.title ?? undefined } : {};
}

/** /instructors/[slug] – profile (sticky capsule portrait, giant name), the classes they teach and the next 7 days. */
export default async function InstructorPage({ params }: { params: Params }) {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) notFound();
  const config = bookingConfig(runtime.config.moduleConfig);
  const now = new Date();
  const today = bkkDateString(now);
  const look = lookOf(runtime.config) === "default" ? "studio" : lookOf(runtime.config);

  const data = await tenantTx(tenantId, async (tx) => {
    const person = await getInstructorBySlug(tx, tenantId, slug);
    if (!person) return null;
    const [classes, sessions] = await Promise.all([listClasses(tx, tenantId, { instructorId: person.id }), listTimetable(tx, tenantId, { from: today, days: 7, config, now, instructorId: person.id })]);
    return { person, classes, sessions: sessions.filter((s) => s.state !== "past").slice(0, 10) };
  });
  if (!data) notFound();
  const { person, classes, sessions } = data;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <SectionStyles />
      <BookingStyles />
      <section className="container-x pt-6 pb-20 md:pt-10 md:pb-32">
        <nav aria-label="breadcrumb" className="mb-6 flex items-center text-sm text-muted-foreground md:mb-10">
          <Link href="/instructors" className="inline-flex h-11 items-center hover:text-foreground">
            {L.instructors}
          </Link>
          <ChevronRight aria-hidden className="mx-1 size-3.5" />
          <span className="truncate text-foreground">{person.name}</span>
        </nav>
        <div className="grid gap-10 md:grid-cols-12 md:gap-14">
          <div className="md:col-span-5">
            <div className="group mx-auto max-w-[22rem] md:sticky md:top-[calc(var(--header-h,72px)+2rem)] md:max-w-[26rem]">
              <Portrait src={person.avatar} alt={person.name} name={person.name} color={person.color} look={look} aspect="aspect-[3/4.4]" priority />
            </div>
          </div>
          <div className="md:col-span-7 md:pt-6">
            {person.title && <Eyebrow text={person.title} className="mb-5" />}
            <RevealHeading as="h1" text={nameLines(person.name)} trigger="mount" mode="words" className={cn("font-heading font-semibold", titleStep(person.name))} />
            {person.bio && <Prose text={person.bio} className="mt-6 max-w-2xl text-step-1 text-muted-foreground" />}
            <dl className="mt-8 flex flex-wrap gap-x-12 gap-y-4 border-y border-[color-mix(in_oklab,var(--foreground)_12%,transparent)] py-5">
              <div>
                <dt className="text-xs text-muted-foreground">{L.teaches}</dt>
                <dd className="font-heading text-step-3 font-semibold">{classes.length} คลาส</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">รอบต่อสัปดาห์</dt>
                <dd className="font-heading text-step-3 font-semibold">{person.weeklySessions} รอบ</dd>
              </div>
            </dl>
            <div className="mt-8 flex flex-wrap gap-3">
              <CtaButton href={`/schedule?instructor=${encodeURIComponent(person.slug)}`} label="ดูตารางสอน" size="xl" className="w-full sm:w-auto" />
              <CtaButton href="/instructors" label={L.instructors} variant="outline" size="xl" magnetic={false} arrow={false} className="w-full sm:w-auto" />
            </div>

            <div className="mt-16 md:mt-24">
              <Rise className="flex items-end justify-between gap-3">
                <h2 className="font-heading text-step-3 font-semibold">รอบสอน 7 วันข้างหน้า</h2>
                <Link href={`/schedule?instructor=${encodeURIComponent(person.slug)}`} className="inline-flex h-11 items-center gap-1 text-sm font-medium text-primary-ink underline-offset-4 hover:underline">
                  ทั้งสัปดาห์ <ArrowRight className="size-4" />
                </Link>
              </Rise>
              {sessions.length === 0 ? (
                <div className="bk-panel mt-6 flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                  <CalendarDays className="size-8" /> {L.noSessionsThisWeek}
                </div>
              ) : (
                <Rise className="mt-4 border-t border-[color-mix(in_oklab,var(--foreground)_10%,transparent)]">
                  {sessions.map((s) => (
                    <SessionRow key={`${s.serviceId}-${s.start}`} s={s} showDate />
                  ))}
                </Rise>
              )}
            </div>
          </div>
        </div>

        <div className="mt-24 md:mt-36">
          <Rise className="mb-10 md:mb-14">
            <h2 className="font-heading text-step-4 font-semibold">คลาสที่สอน</h2>
          </Rise>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีคลาสที่เปิดรับสมัคร</p>
          ) : (
            <StaggerList className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3" stagger={0.1}>
              {classes.map((c, i) => (
                <StaggerCell key={c.id} className="h-full">
                  <ClassStudioCard c={c} look={look} index={i} />
                </StaggerCell>
              ))}
            </StaggerList>
          )}
        </div>
      </section>
    </PageBody>
  );
}
