import type { Metadata } from "next";
import { decodeSlug } from "@/lib/slug";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { Img, Prose } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { getStaffBySlug } from "@rentweb/module-booking/services";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const s = await tenantTx(tenantId, (tx) => getStaffBySlug(tx, tenantId, slug));
  return s ? { title: s.name, description: s.bio ?? s.title ?? undefined } : {};
}

/** /staff/[slug] – profile + the services this person performs (with their own price/duration when overridden). */
export default async function StaffProfilePage({ params }: { params: Params }) {
  const { tenantId, slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("booking")) notFound();
  const person = await tenantTx(tenantId, (tx) => getStaffBySlug(tx, tenantId, slug));
  if (!person || !person.active) notFound();
  const services = person.services.filter((s) => s.active);
  const initials = person.name.replace(/^(พี่|คุณ|ดร\.|นพ\.|พญ\.|ทพ\.|ทพญ\.)\s*/u, "").slice(0, 2);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <nav aria-label="breadcrumb" className="mb-6 text-sm text-muted-foreground">
          <Link href="/staff" className="inline-flex h-11 items-center hover:text-foreground">
            {L.staff}
          </Link>
        </nav>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:gap-12">
          <Reveal>
            <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-[var(--radius-xl)] bg-muted" style={{ boxShadow: `0 20px 50px -20px ${person.color}66` }}>
              {person.avatar ? (
                <Img src={person.avatar} alt={person.name} className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center font-heading text-6xl font-semibold text-white" style={{ backgroundColor: person.color }}>
                  {initials}
                </div>
              )}
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            {person.title && <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{person.title}</p>}
            <h1 className="heading-display mt-3 text-4xl font-semibold md:text-5xl">{person.name}</h1>
            {person.bio && <Prose text={person.bio} className="mt-5 text-muted-foreground" />}
            {person.acceptsOnlineBooking ? (
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link href={`/book?staff=${encodeURIComponent(person.slug)}`}>
                    {L.bookWith(person.name)} <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="mt-6 rounded-[var(--radius-lg)] bg-muted p-4 text-sm text-muted-foreground">ขณะนี้ไม่เปิดรับจองออนไลน์ กรุณาติดต่อร้านโดยตรง</p>
            )}

            <h2 className="font-heading mt-10 text-2xl font-semibold">{L.staffServices}</h2>
            {services.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">ยังไม่มีบริการที่เปิดให้จอง</p>
            ) : (
              <Stagger className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3">
                {services.map((s) => {
                  const price = s.priceOverride ?? s.price;
                  const duration = s.durationOverrideMin ?? s.durationMin;
                  return (
                    <StaggerItem key={s.id}>
                      <Link href={`/book?service=${encodeURIComponent(s.slug)}&staff=${encodeURIComponent(person.slug)}`} className="card group flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-primary/50">
                        {s.image ? <Img src={s.image} alt="" className="size-16 shrink-0 rounded-[var(--radius-lg)] object-cover" /> : <span className="size-16 shrink-0 rounded-[var(--radius-lg)] bg-muted" aria-hidden />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium group-hover:text-primary">{s.name}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3" /> {L.minutes(duration)}
                            {s.categoryName && <span>· {s.categoryName}</span>}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-heading font-semibold text-primary">{price === 0 ? s.priceNote || L.free : thb(price)}</p>
                          <p className="text-xs text-muted-foreground">{L.bookNow}</p>
                        </div>
                      </Link>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            )}
          </Reveal>
        </div>
      </section>
    </PageBody>
  );
}
