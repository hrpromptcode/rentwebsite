import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, CalendarDays, Sparkles, Ticket } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { BreathingOrb } from "@rentweb/ui/three";
import { Rise, StaggerCell, StaggerList } from "@rentweb/storefront";
import { CLASS_LEVELS, LEVEL_LABELS, isClassLevel, listClasses, packagesEnabled } from "@rentweb/module-booking/services";
import { ClassStudioCard, FilterPills, INDEX_LABEL, ModuleIntro, lookOf } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "booking", "classes", { title: "คลาสเรียนทั้งหมด" }) : {};
}

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ level?: string; category?: string }>;

/**
 * /classes?level=beginner&category=<slug> – every open class (course template, §5.8): giant intro with the studio's
 * breathing orb, level / category pills with a sliding active pill, studio cards. A filtered view names only its own
 * classes (nothing else on the page lists other classes).
 */
export default async function ClassesPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const { level: rawLevel, category } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("booking")) return cmsFallback(runtime, "classes");
  const level = isClassLevel(rawLevel) ? rawLevel : null;
  const passes = packagesEnabled(runtime.config.modules, runtime.config.moduleConfig);
  const look = lookOf(runtime.config);
  const allow3d = (runtime.theme.effects as { scene3d?: string }).scene3d !== "off";

  const all = await tenantTx(tenantId, (tx) => listClasses(tx, tenantId));
  const categories = [...new Map(all.filter((c) => c.categorySlug).map((c) => [c.categorySlug!, { slug: c.categorySlug!, name: c.categoryName ?? c.categorySlug! }])).values()];
  const levels = CLASS_LEVELS.filter((lv) => all.some((c) => c.level === lv));
  const activeCategory = categories.find((c) => c.slug === category) ?? null;
  const classes = all.filter((c) => (level ? c.level === level : true)).filter((c) => (activeCategory ? c.categorySlug === activeCategory.slug : true));
  const href = (next: { level?: string | null; category?: string | null }) => {
    const q = new URLSearchParams();
    const lv = next.level === undefined ? level : next.level;
    const cat = next.category === undefined ? (activeCategory?.slug ?? null) : next.category;
    if (lv) q.set("level", lv);
    if (cat) q.set("category", cat);
    const s = q.toString();
    return s ? `/classes?${s}` : "/classes";
  };
  const sessionsPerWeek = classes.reduce((n, c) => n + c.sessions.length, 0);

  const orb = (
    <div className="relative mx-auto aspect-square w-[min(84vw,24rem)] lg:mr-0 lg:w-full lg:max-w-[26rem]">
      {allow3d ? <BreathingOrb className="relative h-full w-full" /> : <span aria-hidden className="bk-breathe absolute inset-[12%] rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--glow),var(--primary)_55%,var(--accent))] opacity-80" />}
    </div>
  );

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <ModuleIntro
        eyebrow={L.classes}
        index={`02 / ${INDEX_LABEL.classes}`}
        title={activeCategory ? activeCategory.name : level ? `คลาส${LEVEL_LABELS[level]}` : "คลาสทั้งหมด"}
        lead={`${classes.length} คลาส · ${sessionsPerWeek} รอบต่อสัปดาห์ · เลือกระดับที่เหมาะกับคุณ ดูรอบเรียนและที่นั่งคงเหลือ แล้วสมัครได้ทันที`}
        aside={look === "studio" ? orb : undefined}
      >
        {(levels.length > 1 || categories.length > 1) && (
          <div className="space-y-2">
            {levels.length > 1 && (
              <FilterPills id="cls-level" ariaLabel={L.level} items={[{ href: href({ level: null }), label: "ทั้งหมด", active: !level }, ...levels.map((lv) => ({ href: href({ level: lv }), label: LEVEL_LABELS[lv], active: level === lv }))]} />
            )}
            {categories.length > 1 && (
              <FilterPills
                id="cls-cat"
                tone="soft"
                ariaLabel="หมวดหมู่คลาส"
                items={[{ href: href({ category: null }), label: "ทุกหมวด", active: !activeCategory }, ...categories.map((c) => ({ href: href({ category: c.slug }), label: c.name, active: activeCategory?.slug === c.slug }))]}
              />
            )}
          </div>
        )}
      </ModuleIntro>

      <section className="container-x pb-20 md:pb-32">
        {classes.length === 0 ? (
          <div className="bk-panel flex flex-col items-center gap-3 p-12 text-center">
            <Sparkles className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">{all.length ? "ไม่มีคลาสที่ตรงกับตัวกรองนี้ ลองเลือกระดับหรือหมวดอื่น" : L.noClasses}</p>
            {all.length > 0 && (
              <Link href="/classes" className="inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-medium hover:border-primary">
                ดูคลาสทั้งหมด
              </Link>
            )}
          </div>
        ) : (
          <StaggerList className="grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3" stagger={0.08}>
            {classes.map((c, i) => (
              <StaggerCell key={c.id} className={cn("h-full", i % 3 === 1 && "lg:translate-y-16")}>
                <ClassStudioCard c={c} look={look === "default" ? "studio" : look} index={i} />
              </StaggerCell>
            ))}
          </StaggerList>
        )}

        <Rise className="mt-24 grid gap-4 md:mt-36 md:grid-cols-2">
          <Link href="/schedule" className="bk-panel bk-soft-bg group relative flex flex-col items-start gap-3 overflow-hidden p-8 transition-transform duration-500 hover:-translate-y-1 md:p-10">
            <CalendarDays className="size-6 text-primary" />
            <span className="font-heading text-step-3 leading-tight font-semibold text-balance">ดูตารางเรียนทั้งสัปดาห์</span>
            <span className="text-sm text-muted-foreground">เลือกวันและเวลาที่สะดวก เห็นที่นั่งคงเหลือทุกรอบ สมัครได้ในคลิกเดียว</span>
            <span className="mt-4 inline-flex items-center gap-1.5 font-medium text-primary-ink">
              {L.weeklyTimetable} <ArrowUpRight className="size-4 transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </Link>
          {passes && (
            <Link href="/packages" className="bk-panel group relative flex flex-col items-start gap-3 overflow-hidden p-8 transition-transform duration-500 hover:-translate-y-1 md:p-10">
              <Ticket className="size-6 text-primary" />
              <span className="font-heading text-step-3 leading-tight font-semibold text-balance">เรียนบ่อย ซื้อคลาสพาสคุ้มกว่า</span>
              <span className="text-sm text-muted-foreground">พาส 5 / 10 ครั้ง ใช้ได้ทุกคลาส ทุกครู ระบบตัดครั้งให้อัตโนมัติเมื่อสมัครเรียน</span>
              <span className="mt-4 inline-flex items-center gap-1.5 font-medium text-primary-ink">
                {L.passes} <ArrowUpRight className="size-4 transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </Link>
          )}
        </Rise>
      </section>
    </PageBody>
  );
}
