import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BadgeCheck, CalendarDays, Clock, Coins, Sparkles, Ticket, Users } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { Img } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { bookingConfig, getClassBySlug, listClasses, listClinicPackages, packagesEnabled, upcomingSessions, type ClassItem } from "@rentweb/module-booking/services";
import { ClassCard, InstructorAvatar, LevelBadge, SessionRow, enrolHref, weeklyRhythm } from "@rentweb/module-booking/ui";
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

/**
 * Description convention for classes: paragraphs separated by blank lines; a paragraph whose lines start with "- "
 * is rendered as a check list ("สิ่งที่จะได้เรียน").
 */
function Syllabus({ text }: { text: string }) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="space-y-4 leading-relaxed text-muted-foreground">
      {paras.map((p, i) => {
        const lines = p.split("\n");
        if (lines.every((l) => /^[-•]\s/.test(l))) {
          return (
            <ul key={i} className="grid gap-2 sm:grid-cols-2">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2 text-foreground">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" /> <span>{l.replace(/^[-•]\s/, "")}</span>
                </li>
              ))}
            </ul>
          );
        }
        const heading = /^[^\n]{2,40}:$/.test(lines[0] ?? "") ? lines.shift()!.slice(0, -1) : null;
        return (
          <div key={i}>
            {heading && <p className="mb-1 font-heading text-lg font-semibold text-foreground">{heading}</p>}
            <p>
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

/** /classes/[slug] – syllabus, instructors, weekly rhythm and the next sessions with seats left; "สมัครเรียน" → /book preselected. */
export default async function ClassPage({ params }: { params: Params }) {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) notFound();
  const config = bookingConfig(runtime.config.moduleConfig);
  const passes = packagesEnabled(runtime.config.modules, runtime.config.moduleConfig);

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

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <nav aria-label="breadcrumb" className="mb-6 text-sm text-muted-foreground">
          <Link href="/classes" className="inline-flex h-11 items-center hover:text-foreground">
            {L.classes}
          </Link>
          {cls.categoryName && (
            <>
              <span className="mx-2">/</span>
              <Link href={`/classes?category=${encodeURIComponent(cls.categorySlug ?? "")}`} className="inline-flex h-11 items-center hover:text-foreground">
                {cls.categoryName}
              </Link>
            </>
          )}
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <Reveal>
            <div className="relative overflow-hidden rounded-[var(--radius-xl)] bg-muted">
              {cls.image ? <Img src={cls.image} alt={cls.name} className="aspect-[4/3] w-full object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center text-primary"><Sparkles className="size-10" /></div>}
              <LevelBadge level={cls.level} className="absolute top-4 left-4 bg-background/95 px-3 py-1.5 text-sm backdrop-blur" />
            </div>
          </Reveal>
          <Reveal delay={0.05} className="flex flex-col">
            {cls.categoryName && <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{cls.categoryName}</p>}
            <h1 className="heading-display mt-3 text-4xl font-semibold md:text-5xl">{cls.name}</h1>
            {instructors.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label={L.instructors}>
                {instructors.map((i) => (
                  <li key={i.id}>
                    <Link href={`/instructors/${i.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card py-1 pr-4 pl-1 text-sm transition hover:border-primary/60 hover:text-primary">
                      <InstructorAvatar i={i} size="sm" /> {i.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <dl className="mt-6 grid grid-cols-2 gap-3">
              {facts.map((f) => (
                <div key={f.label} className="rounded-[var(--radius-lg)] bg-muted/60 p-4">
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <f.icon className="size-3.5" /> {f.label}
                  </dt>
                  <dd className="mt-1 font-heading text-lg font-semibold">{f.value}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 text-sm text-muted-foreground">{firstOpen ? `รอบถัดไปที่ว่าง: ${new Date(firstOpen.start).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", weekday: "short", day: "numeric", month: "short" })} ${new Date(firstOpen.start).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false })} น. · ${L.seatsLeft(firstOpen.remaining)}` : "ยังไม่มีรอบที่เปิดรับสมัครในช่วงนี้"} · {L.policy(config.cancelHours)}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href={bookHref}>
                  {L.enrolClass} <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href={`/schedule?class=${encodeURIComponent(cls.slug)}`}>{L.schedule}</Link>
              </Button>
            </div>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_minmax(0,420px)] lg:gap-14">
          <div>
            <Reveal>
              <h2 className="font-heading text-2xl font-semibold md:text-3xl">เกี่ยวกับคลาสนี้</h2>
            </Reveal>
            <Reveal delay={0.05} className="mt-5">
              {cls.description ? <Syllabus text={cls.description} /> : <p className="text-muted-foreground">คลาสขนาดเล็ก ดูแลใกล้ชิดโดยครูผู้สอน เหมาะกับทุกคนที่อยากเริ่มต้นหรือพัฒนาต่อ</p>}
            </Reveal>
            {passes && passList.length > 0 && (
              <Reveal className="mt-8 flex flex-col gap-3 rounded-[var(--radius-xl)] bg-primary-soft p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-heading flex items-center gap-2 text-lg font-semibold">
                    <Ticket className="size-5 text-primary" /> ใช้คลาสพาสกับคลาสนี้ได้
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {passList.map((p) => `${p.name} ${thb(p.price)}`).join(" · ")} — ระบบตัดครั้งให้อัตโนมัติเมื่อสมัครเรียน
                  </p>
                </div>
                <Button asChild variant="outline" className="h-11 shrink-0">
                  <Link href="/packages">{L.buyPass}</Link>
                </Button>
              </Reveal>
            )}
          </div>

          <div>
            <Reveal className="flex items-end justify-between gap-3">
              <h2 className="font-heading text-2xl font-semibold md:text-3xl">{L.upcomingSessions}</h2>
              <Link href={`/schedule?class=${encodeURIComponent(cls.slug)}`} className="inline-flex h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
                ดูทั้งหมด
              </Link>
            </Reveal>
            {sessions.length === 0 ? (
              <div className="card mt-5 flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <CalendarDays className="size-8" /> {L.noSessionsThisWeek}
              </div>
            ) : (
              <Stagger className="mt-5 grid gap-3" data-testid="upcoming-sessions">
                {sessions.map((s) => (
                  <StaggerItem key={s.start}>
                    <SessionRow s={s} showDate />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-16">
            <Reveal>
              <h2 className="font-heading text-2xl font-semibold md:text-3xl">คลาสที่คุณอาจชอบ</h2>
            </Reveal>
            <Stagger className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((c) => (
                <StaggerItem key={c.id} className="h-full">
                  <ClassCard c={c} />
                </StaggerItem>
              ))}
            </Stagger>
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
