import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, ChevronLeft, Layers, Sparkles } from "lucide-react";
import { Reveal } from "@rentweb/ui/motion";
import { Img, Prose } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { isUuid } from "@rentweb/core";
import { getClinicPackage } from "@rentweb/module-booking/services";
import { depositMethodOptions } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { BuyForm } from "./buy-form";
import { purchasePackageAction } from "./actions";

type Params = Promise<{ tenantId: string; id: string }>;

export const metadata: Metadata = { title: "ซื้อคอร์ส" };

/** /packages/[id]/buy – summary + payment method → purchase (login required). */
export default async function BuyPackagePage({ params }: { params: Params }) {
  const { tenantId, id } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("clinic")) notFound();
  if (!isUuid(id)) notFound();
  const pkg = await tenantTx(tenantId, (tx) => getClinicPackage(tx, tenantId, id));
  if (!pkg || !pkg.active) notFound();
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent(`/packages/${id}/buy`)}`);

  const methods = depositMethodOptions(runtime.config.settings).filter((m) => m.value === "promptpay_qr" || m.value === "slip");
  const perSession = Math.round(pkg.price / Math.max(1, pkg.sessions));
  const save = pkg.compareAtPrice && pkg.compareAtPrice > pkg.price ? Math.round(((pkg.compareAtPrice - pkg.price) / pkg.compareAtPrice) * 100) : 0;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <div className="mx-auto max-w-4xl">
          <Link href="/packages" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
            <ChevronLeft className="size-4" /> คอร์สทั้งหมด
          </Link>
          <div className="mt-2 grid gap-8 md:grid-cols-[1fr_minmax(0,380px)] md:gap-10">
            <Reveal>
              <div className="overflow-hidden rounded-[var(--radius-xl)] bg-muted">{pkg.image ? <Img src={pkg.image} alt={pkg.name} className="aspect-[16/10] w-full object-cover" /> : <div className="aspect-[16/10]" aria-hidden />}</div>
              <p className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-primary">{pkg.serviceName ?? "คอร์ส"}</p>
              <h1 className="heading-display mt-2 text-3xl font-semibold md:text-5xl">{pkg.name}</h1>
              {pkg.description && <Prose text={pkg.description} className="mt-4 text-muted-foreground" />}
              <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Fact icon={Layers} label="จำนวนครั้ง" value={L.sessions(pkg.sessions)} />
                <Fact icon={CalendarClock} label="อายุคอร์ส" value={L.validity(pkg.validityDays)} />
                <Fact icon={Sparkles} label={L.perSession} value={thb(perSession)} />
              </dl>
            </Reveal>
            <Reveal delay={0.05}>
              <div className="card sticky top-24 p-5 md:p-6">
                <p className="text-sm text-muted-foreground">ยอดชำระ</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="font-heading text-3xl font-semibold text-primary">{thb(pkg.price)}</span>
                  {pkg.compareAtPrice && pkg.compareAtPrice > pkg.price && (
                    <>
                      <span className="text-sm text-muted-foreground line-through">{thb(pkg.compareAtPrice)}</span>
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">{L.save(save)}</span>
                    </>
                  )}
                </div>
                <p className="mt-3 rounded-[var(--radius-md)] bg-muted/60 px-3 py-2 text-sm">
                  ซื้อในชื่อ <span className="font-medium">{customer.name ?? customer.phone ?? customer.email}</span>
                  {customer.phone && customer.name && <span className="text-muted-foreground"> · {customer.phone}</span>}
                </p>
                <div className="mt-5">
                  <BuyForm methods={methods} amountLabel={thb(pkg.price)} action={purchasePackageAction.bind(null, tenantId, pkg.id)} />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </PageBody>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Layers; label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-muted/60 p-4">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </dt>
      <dd className="mt-1 font-heading text-lg font-semibold">{value}</dd>
    </div>
  );
}
