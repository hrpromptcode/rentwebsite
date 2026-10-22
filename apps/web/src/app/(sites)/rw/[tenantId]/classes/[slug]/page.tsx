import type { Metadata } from "next";
import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, BadgeCheck, CalendarDays, ChevronRight, Clock, Coins, Sparkles, Ticket, Users } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { ImageReveal } from "@rentweb/ui/motion";
import { CtaButton, Eyebrow, RevealHeading, Rise, SectionStyles, StaggerCell, StaggerList } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { bookingConfig, getClassBySlug, listClasses, listClinicPackages, packagesEnabled, upcomingSessions, type ClassItem } from "@rentweb/module-booking/services";
import { BookingStyles, ClassStudioCard, InstructorAvatar, LevelBadge, SessionRow, enrolHref, frameClass, lookOf, titleStep, nameLines, weeklyRhythm, NameWrap } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { decodeSlug } from "@/lib/slug";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const c = await tenantTx(tenantId, (tx) => getClassBySlug(tx, tenantId, slug));
  return c ? { title: c.name, description: c.description?.split(/\n/)[0] ?? undefined, openGraph: c.image ? { images: [c.image] } : undefined } : {};
}

const big = (url: string) => (/images\.unsplash\.com/.test(url) ? url.replace(/([?&]w=)\d+/, "$11400") : url);

/**
 * Description convention for classes: paragraphs separated by blank lines; a paragraph whose lines start with "- "
 * is rendered as a check list ("สิ่งที่จะได้เรียน").
 */
function Syllabus({ text }: { text: string }) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="space-y-6 text-step-0 leading-relaxed text-muted-foreground">
      {paras.map((p, i) => {
        const lines = p.split("\n");
        if (lines.every((l) => /^[-•]\s/.test(l))) {
          return (
            <ul key={i} className="grid gap-x-8 sm:grid-cols-2">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-3 border-b border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] py-3 text-foreground">
                  <BadgeCheck className="mt-0.5 size-5 shrink-0 text-primary" /> <span>{l.replace(/^[-•]\s/, "")}</span>
                </li>
              ))}
            </ul>
          );
        }
        const heading = /^[^\n]{2,40}:$/.test(lines[0] ?? "") ? lines.shift()!.slice(0, -1) : null;
        // "หัวข้อ:" followed by "- " lines → heading + check list
        if (heading && lines.length && lines.every((l) => /^[-•]\s/.test(l))) {
          return (
            <div key={i}>
              <p className="mb-2 font-heading text-step-2 font-semibold text-foreground">{heading}</p>
              <ul className="grid gap-x-8 sm:grid-cols-2">
                {lines.map((l, j) => (
                  <li key={j} className="flex gap-3 border-b border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] py-3 text-foreground">
                    <BadgeCheck className="mt-0.5 size-5 shrink-0 text-primary" /> <span>{l.replace(/^[-•]\s/, "")}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        return (
          <div key={i}>
            {heading && <p className="mb-2 font-heading text-step-2 font-semibold text-foreground">{heading}</p>}
            <p className={cn(i === 0 && !heading && "text-step-1 text-foreground/85")}>
              {lines.map((line, j) => (
                <span key={j}>
                  {line}
                  {j < lines.length - 1 && <br />}
                </span>
              ))}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** /classes/[slug] – parallax media + sticky action box, syllabus, next sessions with seats left; "สมัครเรียน" → /book preselected. */
export default async function ClassPage({ params }: { params: Params }) {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) notFound();
  const config = bookingConfig(runtime.config.moduleConfig);
  const passes = packagesEnabled(runtime.config.modules, runtime.config.moduleConfig);
  const look = lookOf(runtime.config) === "default" ? "studio" : lookOf(runtime.config);

  const data = await tenantTx(tenantId, async (tx) => {
    const cls = await getClassBySlug(tx, tenantId, slug);
    if (!cls || !cls.active) return null;
    const [sessions, related, passList] = await Promise.all([
      upcomingSessions(tx, tenantId, cls.id, { config, limit: 8 }),
      listClasses(tx, tenantId, { categorySlug: cls.categorySlug ?? undefined }),
      passes ? listClinicPackages(tx, tenantId, { limit: 3 }) : Promise.resolve([]),
    ]);
    return { cls, sessions, related: related.filter((r) => r.id !== cls.id).slice(0, 3), passList };
  });
  if (!data) notFound();
  const { cls, sessions, related, passList } = data;
  const firstOpen = sessions.find((s) => s.state === "open") ?? null;
  const bookHref = firstOpen ? enrolHref(firstOpen) : `/book?service=${encodeURIComponent(cls.slug)}`;
  const instructors = dedupeInstructors(cls);
  const facts = [
    { icon: Clock, label: "ระยะเวลา", value: L.minutes(cls.durationMin) },
    { icon: Coins, label: L.perClass, value: cls.price === 0 ? cls.priceNote || L.free : thb(cls.price) },
    { icon: Users, label: "ที่นั่งต่อรอบ", value: `${cls.capacity} คน` },
    cls.sessions.length ? { icon: CalendarDays, label: "รอบประจำ", value: weeklyRhythm(cls.sessions, 3) } : null,
  ].filter(Boolean) as Array<{ icon: typeof Clock; label: string; value: string }>;
  const nextLine = firstOpen
    ? `รอบถัดไปที่ว่าง: ${new Date(firstOpen.start).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", weekday: "short", day: "numeric", month: "short" })} ${new Date(firstOpen.start).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false })} น. · ${L.seatsLeft(firstOpen.remaining)}`
    : "ยังไม่มีรอบที่เปิดรับสมัครในช่วงนี้";

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <SectionStyles />
      <BookingStyles />
      <section className="container-x pt-6 pb-20 md:pt-10 md:pb-32">
        <nav aria-label="breadcrumb" className="mb-6 flex flex-wrap items-center text-sm text-muted-foreground md:mb-10">
          <Link href="/classes" className="inline-flex h-11 min-w-11 items-center hover:text-foreground">
            {L.classes}
          </Link>
          {cls.categoryName && (
            <>
              <ChevronRight aria-hidden className="mx-1 size-3.5" />
              <Link href={`/classes?category=${encodeURIComponent(cls.categorySlug ?? "")}`} className="inline-flex h-11 min-w-11 items-center hover:text-foreground">
                {cls.categoryName}
              </Link>
            </>
          )}
        </nav>

        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <div className={cn("bk-frame relative mx-auto aspect-[4/5] w-full max-w-[38rem] lg:aspect-[5/6] lg:max-w-none", frameClass(look))}>
              {cls.image ? <ImageReveal src={big(cls.image)} alt={cls.name} priority from="bottom" parallax={0.1} className="size-full" /> : <span className="flex size-full items-center justify-center text-primary"><Sparkles className="size-10" /></span>}
              <LevelBadge level={cls.level} className="absolute top-5 left-5 z-10 bg-background/95 px-3 py-1.5 text-sm backdrop-blur" />
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-[calc(var(--header-h,72px)+2rem)]">
              {cls.categoryName && <Eyebrow text={cls.categoryName} className="mb-5" />}
              <RevealHeading as="h1" text={nameLines(cls.name)} trigger="mount" mode="words" className={cn("font-heading font-semibold text-pretty", titleStep(cls.name) === "text-step-6" ? "text-step-5" : "text-step-4")} />
              {instructors.length > 0 && (
                <ul className="mt-6 flex flex-wrap gap-2" aria-label={L.instructors}>
                  {instructors.map((i) => (
                    <li key={i.id}>
                      <Link href={`/instructors/${i.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] py-1 pr-4 pl-1 text-sm transition-colors hover:border-primary hover:text-primary-ink">
                        <InstructorAvatar i={i} size="sm" /> {i.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <dl className="mt-8 grid grid-cols-2 border-t border-[color-mix(in_oklab,var(--foreground)_12%,transparent)]">
                {facts.map((f, i) => (
                  <div key={f.label} className={cn("border-b border-[color-mix(in_oklab,var(--foreground)_12%,transparent)] py-4", i % 2 === 1 && "border-l pl-5")}>
                    <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <f.icon className="size-3.5" /> {f.label}
                    </dt>
                    <dd className="mt-1 font-heading text-lg font-semibold">
                      {f.value.includes(" · ")
                        ? f.value.split(" · ").map((seg, j, all) => (
                            <React.Fragment key={j}>
                              {j > 0 && " "}
                              <span className="whitespace-nowrap">
                                {seg}
                                {j < all.length - 1 && " ·"}
                              </span>
                            </React.Fragment>
                          ))
                        : <NameWrap text={f.value} />}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                {nextLine} · {L.policy(config.cancelHours)}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <CtaButton href={bookHref} label={L.enrolClass} size="xl" className="w-full sm:w-auto" />
                <CtaButton href={`/schedule?class=${encodeURIComponent(cls.slug)}`} label={L.schedule} variant="outline" size="xl" magnetic={false} arrow={false} className="w-full sm:w-auto" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-24 grid gap-14 md:mt-36 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <Rise>
              <h2 className="font-heading text-step-4 font-semibold">เกี่ยวกับคลาสนี้</h2>
            </Rise>
            <Rise delay={0.05} className="mt-8">
              {cls.description ? <Syllabus text={cls.description} /> : <p className="text-muted-foreground">คลาสขนาดเล็ก ดูแลใกล้ชิดโดยครูผู้สอน เหมาะกับทุกคนที่อยากเริ่มต้นหรือพัฒนาต่อ</p>}
            </Rise>
            {passes && passList.length > 0 && (
              <Rise className="bk-panel bk-soft-bg mt-12 flex flex-col gap-5 p-7 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 font-heading text-step-2 font-semibold">
                    <Ticket className="size-5 text-primary" /> ใช้คลาสพาสกับคลาสนี้ได้
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {passList.map((p) => `${p.name} ${thb(p.price)}`).join(" · ")} — ระบบตัดครั้งให้อัตโนมัติเมื่อสมัครเรียน
                  </p>
                </div>
                <Link href="/packages" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--foreground)_16%,transparent)] px-5 text-sm font-medium transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground">
                  {L.buyPass} <ArrowUpRight className="size-4" />
                </Link>
              </Rise>
            )}
          </div>

          <div className="lg:col-span-5">
            <Rise className="flex items-end justify-between gap-3">
              <h2 className="font-heading text-step-2 font-semibold">{L.upcomingSessions}</h2>
              <Link href={`/schedule?class=${encodeURIComponent(cls.slug)}`} className="inline-flex h-11 items-center text-sm font-medium text-primary-ink underline-offset-4 hover:underline">
                ดูทั้งหมด
              </Link>
            </Rise>
            {sessions.length === 0 ? (
              <div className="bk-panel mt-6 flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <CalendarDays className="size-8" /> {L.noSessionsThisWeek}
              </div>
            ) : (
              <Rise className="mt-4 border-t border-[color-mix(in_oklab,var(--foreground)_10%,transparent)]">
                <div data-testid="upcoming-sessions">
                  {sessions.map((s) => (
                    <SessionRow key={s.start} s={s} showDate inClass />
                  ))}
                </div>
              </Rise>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-24 md:mt-36">
            <Rise className="mb-10 md:mb-14">
              <h2 className="font-heading text-step-4 font-semibold">คลาสที่คุณอาจชอบ</h2>
            </Rise>
            <StaggerList className="bk-rail grid auto-cols-[78%] grid-flow-col gap-4 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:gap-x-8 sm:gap-y-14 lg:grid-cols-3" stagger={0.1}>
              {related.map((c, i) => (
                <StaggerCell key={c.id} className="h-full snap-start">
                  <ClassStudioCard c={c} look={look} index={i} />
                </StaggerCell>
              ))}
            </StaggerList>
          </div>
        )}
      </section>
    </PageBody>
  );
}

function dedupeInstructors(c: ClassItem) {
  const m = new Map(c.instructors.map((i) => [i.id, i]));
  for (const s of c.sessions) if (s.instructor && !m.has(s.instructor.id)) m.set(s.instructor.id, s.instructor);
  return [...m.values()];
}
