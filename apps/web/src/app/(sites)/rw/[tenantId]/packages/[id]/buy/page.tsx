import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, ChevronLeft, Layers, Phone, Sparkles, Wallet } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { Img, Prose } from "@rentweb/storefront";
import { thb } from "@rentweb/core/money";
import { isUuid } from "@rentweb/core";
import { getClinicPackage, packagePaymentMethods, packagesEnabled } from "@rentweb/module-booking/services";
import { CompactIntro, depositMethodOptions, lookOf } from "@rentweb/module-booking/ui";
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
  if (!runtime || !packagesEnabled(runtime.config.modules, runtime.config.moduleConfig)) notFound();
  if (!isUuid(id)) notFound();
  const pkg = await tenantTx(tenantId, (tx) => getClinicPackage(tx, tenantId, id));
  if (!pkg || !pkg.active) notFound();
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent(`/packages/${id}/buy`)}`);

  // ADMIN_B2-04: the methods purchasePackage accepts; none configured → explain instead of a form that can only fail
  const allowed = packagePaymentMethods(runtime.config.settings);
  const methods = depositMethodOptions(runtime.config.settings).filter((m) => allowed.includes(m.value));
  const phone = (runtime.config.settings.contact as { phone?: string } | undefined)?.phone;
  const clinic = runtime.config.modules.includes("clinic");
  const look = lookOf(runtime.config);
  const perSession = Math.round(pkg.price / Math.max(1, pkg.sessions));
  const save = pkg.compareAtPrice && pkg.compareAtPrice > pkg.price ? Math.round(((pkg.compareAtPrice - pkg.price) / pkg.compareAtPrice) * 100) : 0;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-6 pb-20 md:pt-10 md:pb-28">
        <div className="mx-auto max-w-5xl">
          <CompactIntro
            back={
              <Link href="/packages" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
                <ChevronLeft className="size-4" /> {clinic ? "คอร์สทั้งหมด" : "คลาสพาสทั้งหมด"}
              </Link>
            }
            eyebrow={pkg.serviceName ?? (clinic ? "คอร์ส" : "ใช้ได้ทุกคลาส")}
            title={pkg.name}
          />
          <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,380px)] md:gap-12">
            <div>
              <div className={cn("bk-frame aspect-[16/10]", look === "clinic" ? "bk-arch !aspect-[16/11]" : "bk-soft")}>
                {pkg.image ? <Img src={pkg.image} alt={pkg.name} className="bk-cover" priority /> : <div className="bk-soft-bg flex size-full items-end p-6"><span className="bk-pass-num text-primary">{String(pkg.sessions).padStart(2, "0")}</span></div>}
              </div>
              {pkg.description && <Prose text={pkg.description} className="mt-6 text-step-1 text-muted-foreground" />}
              <dl className="mt-6 grid grid-cols-2 border-t border-[color-mix(in_oklab,var(--foreground)_12%,transparent)] sm:grid-cols-3">
                <Fact icon={Layers} label="จำนวนครั้ง" value={L.sessions(pkg.sessions)} />
                <Fact icon={CalendarClock} label="อายุคอร์ส" value={L.validity(pkg.validityDays)} />
                <Fact icon={Sparkles} label={L.perSession} value={thb(perSession)} />
              </dl>
            </div>
            <div>
              <div className="bk-panel bk-float sticky top-[calc(var(--header-h,0px)+1rem)] p-5 md:p-6">
                <p className="text-sm text-muted-foreground">ยอดชำระ</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="font-heading text-step-4 font-semibold leading-none text-primary tabular-nums">{thb(pkg.price)}</span>
                  {pkg.compareAtPrice && pkg.compareAtPrice > pkg.price && (
                    <>
                      <span className="text-sm text-muted-foreground line-through">{thb(pkg.compareAtPrice)}</span>
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-ink">{L.save(save)}</span>
                    </>
                  )}
                </div>
                <div aria-hidden className="bk-perf -mx-5 mt-5 md:-mx-6" />
                <p className="mt-5 rounded-[var(--radius-md)] bg-muted/60 px-3 py-2 text-sm">
                  ซื้อในชื่อ <span className="font-medium">{customer.name ?? customer.phone ?? customer.email}</span>
                  {customer.phone && customer.name && <span className="text-muted-foreground"> · {customer.phone}</span>}
                </p>
                <div className="mt-5">
                  {methods.length ? (
                    <BuyForm methods={methods} amountLabel={thb(pkg.price)} action={purchasePackageAction.bind(null, tenantId, pkg.id)} venue={clinic ? "คลินิก" : "สตูดิโอ"} itemLabel={clinic ? "คอร์ส" : "คลาสพาส"} />
                  ) : (
                    <div role="status" data-payment-notice className="grid gap-3 rounded-[var(--radius-md)] border border-amber-300/70 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
                      <p className="flex items-start gap-2 font-medium">
                        <Wallet className="mt-0.5 size-4 shrink-0" /> {L.packagePaymentsNotice}
                      </p>
                      {phone && (
                        <Button asChild variant="outline" size="lg" className="w-full bg-background">
                          <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`}>
                            <Phone className="size-4" /> โทร {phone}
                          </a>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageBody>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Layers; label: string; value: string }) {
  return (
    <div className="border-b border-[color-mix(in_oklab,var(--foreground)_12%,transparent)] py-4 pr-4">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </dt>
      <dd className="mt-1 font-heading text-lg font-semibold">{value}</dd>
    </div>
  );
}
