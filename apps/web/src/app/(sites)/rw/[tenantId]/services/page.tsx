import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";
import { listServiceCategories, listServices } from "@rentweb/module-booking/services";
import { ServiceCard } from "@rentweb/module-booking/ui";
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

/** /services?category=<slug> – every active service, filterable by category. */
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

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{L.services}</p>
          <h1 className="heading-display mt-3 text-4xl font-semibold md:text-6xl">{active ? active.name : "บริการทั้งหมด"}</h1>
          <p className="mt-4 text-muted-foreground">
            {services.length} รายการ · เลือกบริการเพื่อดูรายละเอียด หรือกด “{L.bookNow}” เพื่อเลือกวันและเวลาได้ทันที
          </p>
        </Reveal>

        {categories.length > 1 && (
          <Reveal delay={0.05} className="-mx-4 mt-8 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <nav aria-label="หมวดหมู่บริการ" className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
              <CategoryChip href="/services" active={!active}>
                ทั้งหมด
              </CategoryChip>
              {categories.map((c) => (
                <CategoryChip key={c.id} href={`/services?category=${encodeURIComponent(c.slug)}`} active={active?.id === c.id}>
                  {c.name}
                </CategoryChip>
              ))}
            </nav>
          </Reveal>
        )}

        {services.length === 0 ? (
          <div className="card mt-10 p-10 text-center text-muted-foreground">ยังไม่มีบริการในหมวดนี้</div>
        ) : (
          <Stagger className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <StaggerItem key={s.id} className="h-full">
                <ServiceCard s={s} />
              </StaggerItem>
            ))}
          </Stagger>
        )}

        <Reveal className="mt-12 flex flex-col items-center gap-3 rounded-[var(--radius-xl)] bg-primary-soft p-8 text-center md:flex-row md:justify-between md:text-left">
          <div>
            <p className="font-heading flex items-center justify-center gap-2 text-xl font-semibold md:justify-start">
              <Sparkles className="size-5 text-primary" /> พร้อมจองแล้วใช่ไหม
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{featured.length ? `บริการยอดนิยม: ${featured.slice(0, 3).map((s) => s.name).join(" · ")}` : "เลือกวันและเวลาที่สะดวก ยืนยันทันที"}</p>
          </div>
          <Button asChild size="lg">
            <Link href="/book">
              {L.bookNow} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </Reveal>
      </section>
    </PageBody>
  );
}

function CategoryChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-11 shrink-0 items-center rounded-full border px-5 text-sm font-medium transition",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/60 hover:text-primary",
      )}
    >
      {children}
    </Link>
  );
}
