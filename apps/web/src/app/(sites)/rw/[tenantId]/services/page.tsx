import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { CtaButton, Rise, StaggerCell, StaggerList } from "@rentweb/storefront";
import { listServiceCategories, listServices } from "@rentweb/module-booking/services";
import { FilterPills, INDEX_LABEL, ModuleIntro, ServiceIndex, ServiceMotifCard, ServicesAside, lookOf } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "booking", "services", { title: "บริการทั้งหมด" }) : {};
}

type Params = Promise<{ tenantId: string }>;
type Search = Promise<{ category?: string }>;

/**
 * /services?category=<slug> – every active service, filterable by category (§5.0 listing page, marketing-light):
 * giant intro + the business signature visual (clinic glass droplets over an arch, spa slow water), category pills with a
 * sliding active pill, then arch cards (clinic / default) or the spa menu index with cursor-following photos.
 */
export default async function ServicesPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenantId } = await params;
  const { category } = await searchParams;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("booking")) return cmsFallback(runtime, "services");

  const { categories, services } = await tenantTx(tenantId, async (tx) => ({
    categories: await listServiceCategories(tx, tenantId),
    services: await listServices(tx, tenantId, { categorySlug: category || undefined, limit: 200 }),
  }));
  const active = categories.find((c) => c.slug === category) ?? null;
  const featured = services.filter((s) => s.featured);
  const look = lookOf(runtime.config);
  const allow3d = (runtime.theme.effects as { scene3d?: string }).scene3d !== "off";
  const visuals = [...featured, ...services].map((s) => s.image).filter((x): x is string => !!x);
  const spaStill = look === "spa" ? (services.find((s) => s.slug === "foot-60" || /หิน|stone/i.test(s.name))?.image ?? visuals[0]) : null;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <ModuleIntro
        eyebrow={active ? L.services : L.services}
        index={`02 / ${INDEX_LABEL.services}`}
        title={active ? active.name : "บริการทั้งหมด"}
        count={services.length}
        countLabel="SERVICES"
        lead={
          <>
            {services.length} รายการ · เลือกบริการเพื่อดูรายละเอียด หรือกด “{L.bookNow}” เพื่อเลือกวันและเวลาได้ทันที
          </>
        }
        aside={visuals.length ? <ServicesAside look={look} images={spaStill ? [spaStill, ...visuals] : visuals} allow3d={allow3d} /> : undefined}
      >
        {categories.length > 1 && (
          <FilterPills
            id="svc-cats"
            ariaLabel="หมวดหมู่บริการ"
            items={[{ href: "/services", label: "ทั้งหมด", active: !active }, ...categories.map((c) => ({ href: `/services?category=${encodeURIComponent(c.slug)}`, label: c.name, active: active?.id === c.id }))]}
          />
        )}
      </ModuleIntro>

      <section className="container-x pb-20 md:pb-32">
        {services.length === 0 ? (
          <div className="bk-panel mt-6 flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
            <Sparkles className="size-8 text-primary" /> ยังไม่มีบริการในหมวดนี้
          </div>
        ) : look === "spa" ? (
          <ServiceIndex services={services} look={look} grouped={!active} className="mt-4" />
        ) : (
          <StaggerList className="mt-4 grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3" stagger={0.08}>
            {services.map((s, i) => (
              <StaggerCell key={s.id} className={cn("h-full", i % 3 === 1 && "lg:translate-y-16")}>
                <ServiceMotifCard s={s} look={look} index={i} priority={i < 3} />
              </StaggerCell>
            ))}
          </StaggerList>
        )}

        <Rise className="bk-panel bk-soft-bg relative mt-24 flex flex-col items-start gap-6 overflow-hidden p-8 md:mt-36 md:flex-row md:items-end md:justify-between md:p-12">
          <div className="max-w-xl">
            <p className="font-heading text-step-3 font-semibold leading-tight">พร้อมจองแล้วใช่ไหม</p>
            <p className="mt-3 text-sm text-muted-foreground md:text-base">{featured.length ? `บริการยอดนิยม: ${featured.slice(0, 3).map((s) => s.name).join(" · ")}` : "เลือกวันและเวลาที่สะดวก ยืนยันทันที"}</p>
          </div>
          <CtaButton href="/book" label={L.bookNow} size="xl" />
        </Rise>
      </section>
    </PageBody>
  );
}
