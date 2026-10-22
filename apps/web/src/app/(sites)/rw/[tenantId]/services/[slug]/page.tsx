import type { Metadata } from "next";
import { decodeSlug } from "@/lib/slug";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Clock, Coins, ShieldCheck, Users, Wallet } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { ImageReveal } from "@rentweb/ui/motion";
import { CtaButton, Eyebrow, Prose, RevealHeading, Rise, SectionStyles, StaggerCell, StaggerList } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { bookingConfig, bookingDepositMethods, getServiceBySlug, listServices, listStaffForService } from "@rentweb/module-booking/services";
import { BookingStyles, ServiceMotifCard, StaffPortraitCard, frameClass, lookOf, servicePriceLabel, titleStep } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const s = await tenantTx(tenantId, (tx) => getServiceBySlug(tx, tenantId, slug));
  return s ? { title: s.name, description: s.description ?? undefined, openGraph: s.image ? { images: [s.image] } : undefined } : {};
}

const big = (url: string) => (/images\.unsplash\.com/.test(url) ? url.replace(/([?&]w=)\d+/, "$11400") : url);

/** /services/[slug] – detail (§5.0): parallax media in the motif frame + a sticky action box; who performs it; related. */
export default async function ServicePage({ params }: { params: Params }) {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
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
  const look = lookOf(runtime.config);
  const depositWanted = config.depositEnabled && service.depositRequired && service.depositAmount > 0;
  // ADMIN_B2-04: without a deposit receiver the booking is taken without one and paid at the shop
  const depositOn = depositWanted && bookingDepositMethods(runtime.config.settings).length > 0;
  const payAtShop = depositWanted && !depositOn;
  const bookHref = `/book?service=${encodeURIComponent(service.slug)}`;

  const facts = [
    { icon: Clock, label: "ระยะเวลา", value: L.minutes(service.durationMin) },
    { icon: Coins, label: L.total, value: servicePriceLabel(service) },
    depositOn ? { icon: Wallet, label: L.deposit, value: thb(service.depositAmount) } : null,
    service.capacity > 1 ? { icon: Users, label: "รองรับ", value: `${service.capacity} ท่าน / รอบ` } : null,
  ].filter(Boolean) as Array<{ icon: typeof Clock; label: string; value: string }>;
  const cols = facts.length === 3 ? 3 : 2;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <SectionStyles />
      <BookingStyles />
      <section className="container-x pt-6 pb-20 md:pt-10 md:pb-32">
        <nav aria-label="breadcrumb" className="mb-6 flex flex-wrap items-center text-sm text-muted-foreground md:mb-10">
          <Link href="/services" className="inline-flex h-11 items-center hover:text-foreground">
            {L.services}
          </Link>
          {service.categoryName && (
            <>
              <ChevronRight aria-hidden className="mx-1 size-3.5" />
              <Link href={`/services?category=${encodeURIComponent(service.categorySlug ?? "")}`} className="inline-flex h-11 items-center hover:text-foreground">
                {service.categoryName}
              </Link>
            </>
          )}
        </nav>

        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <div className={cn("bk-frame mx-auto aspect-[4/5] w-full max-w-[38rem] lg:max-w-none", frameClass(look), look === "clinic" ? "lg:aspect-[5/6]" : "lg:aspect-[4/5]")}>
              {service.image ? (
                <ImageReveal src={big(service.image)} alt={service.name} priority from="bottom" parallax={0.1} className="size-full" />
              ) : (
                <span className="absolute inset-0 bg-primary-soft" aria-hidden />
              )}
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-[calc(var(--header-h,72px)+2rem)]">
              {service.categoryName && <Eyebrow text={service.categoryName} className="mb-5" />}
              <RevealHeading as="h1" text={service.name} trigger="mount" mode="words" className={cn("font-heading font-semibold text-balance", titleStep(service.name) === "text-step-6" ? "text-step-5" : "text-step-4")} />
              {service.description && <Prose text={service.description} className="mt-6 text-step-1 text-muted-foreground" />}

              <dl className={cn("mt-8 grid border-t border-[color-mix(in_oklab,var(--foreground)_12%,transparent)]", cols === 3 ? "grid-cols-3" : "grid-cols-2")}>
                {facts.map((f, i) => (
                  <div key={f.label} className={cn("border-b border-[color-mix(in_oklab,var(--foreground)_12%,transparent)] py-4", i % cols !== 0 && "border-l pl-4 md:pl-5")}>
                    <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <f.icon className="size-3.5" /> {f.label}
                    </dt>
                    <dd className="mt-1 font-heading text-xl font-semibold tabular-nums">{f.value}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-5 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  {depositOn ? L.depositNote(thb(service.depositAmount)) : payAtShop ? L.payAtShopNotice : L.noDeposit} · {L.policy(config.cancelHours)}
                </span>
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <CtaButton href={bookHref} label={L.bookService} size="xl" className="w-full sm:w-auto" />
                <CtaButton href="/services" label={L.viewAllServices} variant="outline" size="xl" magnetic={false} arrow={false} className="w-full sm:w-auto" />
              </div>
            </div>
          </div>
        </div>

        {team.length > 0 && (
          <div className="mt-24 md:mt-36">
            <Rise className="mb-10 grid gap-4 md:mb-14 lg:grid-cols-12 lg:items-end">
              <h2 className="font-heading text-step-4 font-semibold lg:col-span-7">{L.performedBy}</h2>
              <p className="text-muted-foreground lg:col-span-5">เลือกผู้ให้บริการที่ต้องการ หรือให้ระบบจัด “{L.anyStaff}” ให้ในขั้นตอนจอง</p>
            </Rise>
            {team.length === 1 ? (
              <div className="grid items-center gap-10 sm:grid-cols-2 lg:grid-cols-12">
                <Rise className="max-w-sm lg:col-span-4">
                  <StaffPortraitCard s={team[0]!} look={look} index={0} bookHref={`${bookHref}&staff=${encodeURIComponent(team[0]!.slug)}`} />
                </Rise>
                {team[0]!.bio && (
                  <Rise delay={0.1} className="lg:col-span-7 lg:col-start-6">
                    <p className="font-heading text-step-3 leading-snug text-balance">“{team[0]!.bio}”</p>
                    {team[0]!.title && <p className="mt-5 text-sm text-muted-foreground">{team[0]!.name} · {team[0]!.title}</p>}
                  </Rise>
                )}
              </div>
            ) : (
              <StaggerList className={cn("grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2", team.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")} stagger={0.1}>
                {team.map((t, i) => (
                  <StaggerCell key={t.id} className="h-full">
                    <StaffPortraitCard s={t} look={look} index={i} bookHref={`${bookHref}&staff=${encodeURIComponent(t.slug)}`} />
                  </StaggerCell>
                ))}
              </StaggerList>
            )}
          </div>
        )}

        {related.length > 0 && (
          <div className="mt-24 md:mt-36">
            <Rise className="mb-10 md:mb-14">
              <h2 className="font-heading text-step-4 font-semibold">บริการที่เกี่ยวข้อง</h2>
            </Rise>
            <StaggerList className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3" stagger={0.1}>
              {related.map((s, i) => (
                <StaggerCell key={s.id} className="h-full">
                  <ServiceMotifCard s={s} look={look} index={i} />
                </StaggerCell>
              ))}
            </StaggerList>
          </div>
        )}
      </section>
    </PageBody>
  );
}
