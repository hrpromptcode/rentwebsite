import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, UserRound } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { Img, Prose } from "@rentweb/storefront";
import { bkkDateString, bookingConfig, getInstructorBySlug, listClasses, listTimetable } from "@rentweb/module-booking/services";
import { ClassCard, SessionRow } from "@rentweb/module-booking/ui";
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

/** /instructors/[slug] – profile, the classes they teach and their sessions over the next 7 days. */
export default async function InstructorPage({ params }: { params: Params }) {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) notFound();
  const config = bookingConfig(runtime.config.moduleConfig);
  const now = new Date();
  const today = bkkDateString(now);

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
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <nav aria-label="breadcrumb" className="mb-6 text-sm text-muted-foreground">
          <Link href="/instructors" className="inline-flex h-11 items-center hover:text-foreground">
            {L.instructors}
          </Link>
        </nav>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:gap-12">
          <Reveal>
            <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-[var(--radius-xl)] bg-muted" style={{ boxShadow: `0 20px 50px -20px ${person.color}66` }}>
              {person.avatar ? (
                <Img src={person.avatar} alt={person.name} className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-white" style={{ backgroundColor: person.color }}>
                  <UserRound className="size-20" />
                </div>
              )}
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            {person.title && <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{person.title}</p>}
            <h1 className="heading-display mt-3 text-4xl font-semibold md:text-5xl">{person.name}</h1>
            {person.bio && <Prose text={person.bio} className="mt-5 text-muted-foreground" />}
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{L.teaches}</dt>
                <dd className="font-heading text-lg font-semibold">{classes.length} คลาส</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">รอบต่อสัปดาห์</dt>
                <dd className="font-heading text-lg font-semibold">{person.weeklySessions} รอบ</dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href={`/schedule?instructor=${encodeURIComponent(person.slug)}`}>
                  <CalendarDays className="size-4" /> ดูตารางสอน
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/instructors">{L.instructors}</Link>
              </Button>
            </div>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_minmax(0,420px)] lg:gap-14">
          <div>
            <Reveal>
              <h2 className="font-heading text-2xl font-semibold md:text-3xl">คลาสที่สอน</h2>
            </Reveal>
            {classes.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">ยังไม่มีคลาสที่เปิดรับสมัคร</p>
            ) : (
              <Stagger className="mt-6 grid gap-6 sm:grid-cols-2">
                {classes.map((c) => (
                  <StaggerItem key={c.id} className="h-full">
                    <ClassCard c={c} />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
          <div>
            <Reveal className="flex items-end justify-between gap-3">
              <h2 className="font-heading text-2xl font-semibold md:text-3xl">รอบสอน 7 วันข้างหน้า</h2>
              <Link href={`/schedule?instructor=${encodeURIComponent(person.slug)}`} className="inline-flex h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
                ทั้งสัปดาห์ <ArrowRight className="ml-1 size-4" />
              </Link>
            </Reveal>
            {sessions.length === 0 ? (
              <div className="card mt-5 flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <CalendarDays className="size-8" /> {L.noSessionsThisWeek}
              </div>
            ) : (
              <Stagger className="mt-5 grid gap-3">
                {sessions.map((s) => (
                  <StaggerItem key={`${s.serviceId}-${s.start}`}>
                    <SessionRow s={s} showDate />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </div>
      </section>
    </PageBody>
  );
}
