import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays, Sparkles, Ticket } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import { CLASS_LEVELS, LEVEL_LABELS, isClassLevel, listClasses, packagesEnabled } from "@rentweb/module-booking/services";
import { ClassCard } from "@rentweb/module-booking/ui";
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

/** /classes?level=beginner&category=<slug> – every open class (course template) with level / category filters. */
export default async function ClassesPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const { level: rawLevel, category } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("booking")) return cmsFallback(runtime, "classes");
  const level = isClassLevel(rawLevel) ? rawLevel : null;
  const passes = packagesEnabled(runtime.config.modules, runtime.config.moduleConfig);

  const all = await tenantTx(tenantId, (tx) => listClasses(tx, tenantId));
  const categories = [...new Map(all.filter((c) => c.categorySlug).map((c) => [c.categorySlug!, { slug: c.categorySlug!, name: c.categoryName ?? c.categorySlug! }])).values()];
  const levels = CLASS_LEVELS.filter((lv) => all.some((c) => c.level === lv));
  const activeCategory = categories.find((c) => c.slug === category) ?? null;
  const classes = all.filter((c) => (level ? c.level === level : true)).filter((c) => (activeCategory ? c.categorySlug === activeCategory.slug : true));
  const href = (next: { level?: string | null; category?: string | null }) => {
    const q = new URLSearchParams();
    const lv = next.level === undefined ? level : next.level;
    const cat = next.category === undefined ? activeCategory?.slug ?? null : next.category;
    if (lv) q.set("level", lv);
    if (cat) q.set("category", cat);
    const s = q.toString();
    return s ? `/classes?${s}` : "/classes";
  };
  const sessionsPerWeek = classes.reduce((n, c) => n + c.sessions.length, 0);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{L.classes}</p>
          <h1 className="heading-display mt-3 text-4xl font-semibold md:text-6xl">{activeCategory ? activeCategory.name : level ? `คลาส${LEVEL_LABELS[level]}` : "คลาสทั้งหมด"}</h1>
          <p className="mt-4 text-muted-foreground">
            {classes.length} คลาส · {sessionsPerWeek} รอบต่อสัปดาห์ · เลือกระดับที่เหมาะกับคุณ ดูรอบเรียนและที่นั่งคงเหลือ แล้วสมัครได้ทันที
          </p>
        </Reveal>

        {(levels.length > 1 || categories.length > 1) && (
          <Reveal delay={0.05} className="mt-8 space-y-3">
            {levels.length > 1 && (
              <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                <nav aria-label={L.level} className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
                  <Chip href={href({ level: null })} active={!level}>
                    {L.allLevels}
                  </Chip>
                  {levels.map((lv) => (
                    <Chip key={lv} href={href({ level: lv })} active={level === lv}>
                      {LEVEL_LABELS[lv]}
                    </Chip>
                  ))}
                </nav>
              </div>
            )}
            {categories.length > 1 && (
              <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                <nav aria-label="หมวดหมู่คลาส" className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
                  <Chip href={href({ category: null })} active={!activeCategory} variant="soft">
                    ทุกหมวด
                  </Chip>
                  {categories.map((c) => (
                    <Chip key={c.slug} href={href({ category: c.slug })} active={activeCategory?.slug === c.slug} variant="soft">
                      {c.name}
                    </Chip>
                  ))}
                </nav>
              </div>
            )}
          </Reveal>
        )}

        {classes.length === 0 ? (
          <div className="card mt-10 flex flex-col items-center gap-3 p-10 text-center">
            <Sparkles className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">{all.length ? "ไม่มีคลาสที่ตรงกับตัวกรองนี้ ลองเลือกระดับหรือหมวดอื่น" : L.noClasses}</p>
            {all.length > 0 && (
              <Button asChild variant="outline" className="h-11">
                <Link href="/classes">ดูคลาสทั้งหมด</Link>
              </Button>
            )}
          </div>
        ) : (
          <Stagger className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((c) => (
              <StaggerItem key={c.id} className="h-full">
                <ClassCard c={c} />
              </StaggerItem>
            ))}
          </Stagger>
        )}

        <Reveal className="mt-12 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col items-start gap-3 rounded-[var(--radius-xl)] bg-primary-soft p-8">
            <p className="font-heading flex items-center gap-2 text-xl font-semibold">
              <CalendarDays className="size-5 text-primary" /> ดูตารางเรียนทั้งสัปดาห์
            </p>
            <p className="text-sm text-muted-foreground">เลือกวันและเวลาที่สะดวก เห็นที่นั่งคงเหลือทุกรอบ สมัครได้ในคลิกเดียว</p>
            <Button asChild size="lg" className="mt-auto">
              <Link href="/schedule">
                {L.weeklyTimetable} <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          {passes && (
            <div className="flex flex-col items-start gap-3 rounded-[var(--radius-xl)] border p-8">
              <p className="font-heading flex items-center gap-2 text-xl font-semibold">
                <Ticket className="size-5 text-primary" /> เรียนบ่อย ซื้อคลาสพาสคุ้มกว่า
              </p>
              <p className="text-sm text-muted-foreground">พาส 5 / 10 ครั้ง ใช้ได้ทุกคลาส ทุกครู ระบบตัดครั้งให้อัตโนมัติเมื่อสมัครเรียน</p>
              <Button asChild size="lg" variant="outline" className="mt-auto">
                <Link href="/packages">{L.passes}</Link>
              </Button>
            </div>
          )}
        </Reveal>
      </section>
    </PageBody>
  );
}

function Chip({ href, active, children, variant = "solid" }: { href: string; active: boolean; children: React.ReactNode; variant?: "solid" | "soft" }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-11 shrink-0 items-center rounded-full border px-5 text-sm font-medium transition",
        active ? (variant === "solid" ? "border-primary bg-primary text-primary-foreground" : "border-primary bg-primary-soft text-primary-ink") : "border-border bg-card text-foreground hover:border-primary/60 hover:text-primary",
      )}
    >
      {children}
    </Link>
  );
}
