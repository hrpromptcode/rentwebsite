import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock, Coins, Users, Wallet } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { Img, Prose } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { bookingConfig, getServiceBySlug, listServices, listStaffForService } from "@rentweb/module-booking/services";
import { ServiceCard, StaffCard, servicePriceLabel } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug } = await params;
  const s = await tenantTx(tenantId, (tx) => getServiceBySlug(tx, tenantId, slug));
  return s ? { title: s.name, description: s.description ?? undefined, openGraph: s.image ? { images: [s.image] } : undefined } : {};
}

/** /services/[slug] – service detail with the staff who perform it and a direct booking CTA. */
export default async function ServicePage({ params }: { params: Params }) {
  const { tenantId, slug } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) notFound();
  const config = bookingConfig(runtime.config.moduleConfig);

  const data = await tenantTx(tenantId, async (tx) => {
    const service = await getServiceBySlug(tx, tenantId, slug);
    if (!service) return null;
    const [team, related] = await Promise.all([
      service.requiresStaff ? listStaffForService(tx, tenantId, service.id) : Promise.resolve([]),
      listServices(tx, tenantId, { categorySlug: service.categorySlug ?? undefined, limit: 4 }),
    ]);
    return { service, team: team.filter((t) => t.acceptsOnlineBooking), related: related.filter((r) => r.id !== service.id).slice(0, 3) };
  });
  if (!data) notFound();
  const { service, team, related } = data;
  const depositOn = config.depositEnabled && service.depositRequired && service.depositAmount > 0;
  const bookHref = `/book?service=${encodeURIComponent(service.slug)}`;

  const facts = [
    { icon: Clock, label: "ระยะเวลา", value: L.minutes(service.durationMin) },
    { icon: Coins, label: L.total, value: servicePriceLabel(service) },
    depositOn ? { icon: Wallet, label: L.deposit, value: thb(service.depositAmount) } : null,
    service.capacity > 1 ? { icon: Users, label: "รองรับ", value: `${service.capacity} ท่าน / รอบ` } : null,
  ].filter(Boolean) as Array<{ icon: typeof Clock; label: string; value: string }>;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <nav aria-label="breadcrumb" className="mb-6 text-sm text-muted-foreground">
          <Link href="/services" className="inline-flex h-11 items-center hover:text-foreground">
            {L.services}
          </Link>
          {service.categoryName && (
            <>
              <span className="mx-2">/</span>
              <Link href={`/services?category=${encodeURIComponent(service.categorySlug ?? "")}`} className="inline-flex h-11 items-center hover:text-foreground">
                {service.categoryName}
              </Link>
            </>
          )}
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <Reveal>
            <div className="overflow-hidden rounded-[var(--radius-xl)] bg-muted">
              {service.image ? <Img src={service.image} alt={service.name} className="aspect-[4/3] w-full object-cover" /> : <div className="aspect-[4/3]" aria-hidden />}
            </div>
          </Reveal>
          <Reveal delay={0.05} className="flex flex-col">
            {service.categoryName && <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{service.categoryName}</p>}
            <h1 className="heading-display mt-3 text-4xl font-semibold md:text-5xl">{service.name}</h1>
            {service.description && <Prose text={service.description} className="mt-5 text-muted-foreground" />}

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

            <p className="mt-4 text-sm text-muted-foreground">
              {depositOn ? L.depositNote(thb(service.depositAmount)) : L.noDeposit} · {L.policy(config.cancelHours)}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href={bookHref}>
                  {L.bookService} <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/services">{L.viewAllServices}</Link>
              </Button>
            </div>
          </Reveal>
        </div>

        {team.length > 0 && (
          <div className="mt-16">
            <Reveal>
              <h2 className="font-heading text-2xl font-semibold md:text-3xl">{L.performedBy}</h2>
              <p className="mt-1 text-sm text-muted-foreground">เลือกผู้ให้บริการที่ต้องการ หรือให้ระบบจัด “{L.anyStaff}” ให้ในขั้นตอนจอง</p>
            </Reveal>
            <Stagger className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {team.map((t) => (
                <StaggerItem key={t.id} className="h-full">
                  <div className="flex h-full flex-col gap-3">
                    <StaffCard s={t} className="flex-1" />
                    <Button asChild variant="outline" className="h-11">
                      <Link href={`${bookHref}&staff=${encodeURIComponent(t.slug)}`}>{L.bookWith(t.name)}</Link>
                    </Button>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        )}

        {related.length > 0 && (
          <div className="mt-16">
            <Reveal>
              <h2 className="font-heading text-2xl font-semibold md:text-3xl">บริการที่เกี่ยวข้อง</h2>
            </Reveal>
            <Stagger className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((s) => (
                <StaggerItem key={s.id} className="h-full">
                  <ServiceCard s={s} />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        )}
      </section>
    </PageBody>
  );
}
