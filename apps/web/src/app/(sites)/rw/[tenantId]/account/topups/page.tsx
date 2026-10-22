import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Gamepad2, Wallet, Zap } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { thb } from "@rentweb/core/money";
import { listCustomerOrders, maskPlayerId, reconcileTopupOrder } from "@rentweb/module-topup/services";
import { StatusBadge, TopupStyles, dateTimeTh } from "@rentweb/module-topup/components";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";

export const metadata: Metadata = { title: "ประวัติการเติม" };

export default async function AccountTopupsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("topup")) notFound();
  const customer = await getCurrentCustomer(tenantId);
  if (!customer) redirect(`/account/login?next=${encodeURIComponent("/account/topups")}`);
  const orders = await tenantTx(tenantId, async (tx) => {
    const list = await listCustomerOrders(tx, tenantId, customer.id, { limit: 100 });
    const out: typeof list = [];
    for (const o of list) out.push(o.status === "pending_payment" ? await reconcileTopupOrder(tx, tenantId, o) : o);
    return out;
  });
  const spent = orders.filter((o) => o.status === "fulfilled" || o.status === "processing" || o.status === "paid").reduce((s, o) => s + o.price, 0);

  const done = orders.filter((o) => o.status === "fulfilled").length;

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <TopupStyles />
      <section className="container-x pb-16 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <Link href="/account" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
            <ChevronLeft className="size-4" /> บัญชีของฉัน
          </Link>
          <Reveal className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="tp-hud mb-3 text-primary" data-script="latin">
                [ Match history ]
              </p>
              <h1 className="heading-display text-step-4 font-semibold">ประวัติการเติม</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {orders.length} รายการ · ยอดเติมสะสม {thb(spent)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" className="h-11">
                <Link href="/wallet">
                  <Wallet /> กระเป๋าเงิน
                </Link>
              </Button>
              <Button asChild className="h-11 shadow-[0_0_28px_-8px_var(--glow)]">
                <Link href="/games">
                  <Zap /> เติมเกม
                </Link>
              </Button>
            </div>
          </Reveal>

          {orders.length > 0 && (
            <Reveal delay={0.05} className="mt-6">
              <dl aria-hidden className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-lg)] border border-border/60 bg-border/60">
                {[
                  ["Orders", String(orders.length).padStart(2, "0")],
                  ["Success", String(done).padStart(2, "0")],
                  ["Spent", thb(spent)],
                ].map(([k, v]) => (
                  <div key={k} className="bg-card/80 px-4 py-3">
                    <dt className="tp-hud text-[10px] text-muted-foreground" data-script="latin">
                      {k}
                    </dt>
                    <dd className="tp-num mt-1 truncate text-lg font-semibold md:text-xl">{v}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          )}

          {orders.length === 0 ? (
            <div className="relative mt-8 flex flex-col items-center gap-3 overflow-hidden rounded-[var(--radius-xl)] border border-dashed border-border/80 bg-card/50 p-10 text-center">
              <span className="tp-hud text-primary" data-script="latin">
                [ No matches yet ]
              </span>
              <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary shadow-[0_0_30px_-8px_var(--glow)]">
                <Gamepad2 className="size-7" />
              </span>
              <p className="text-muted-foreground">ยังไม่มีรายการเติม เริ่มเติมเกมแรกของคุณได้เลย</p>
              <Button asChild size="lg" className="h-12">
                <Link href="/games">เลือกเกม</Link>
              </Button>
            </div>
          ) : (
            <Stagger className="mt-6 grid gap-3">
              {orders.map((o) => (
                <StaggerItem key={o.id}>
                  <Link
                    href={`/topup/${o.number}`}
                    className="group relative flex items-center gap-4 overflow-hidden rounded-[var(--radius-xl)] border border-border/70 bg-card/70 p-4 pl-5 transition-[border-color,box-shadow,translate] duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_20px_50px_-30px_var(--glow)] md:p-5 md:pl-6"
                  >
                    <span aria-hidden className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${RAIL[o.status] ?? "bg-muted-foreground/50"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tp-num text-sm font-semibold tracking-wide">{o.number}</span>
                        <StatusBadge status={o.status} />
                      </div>
                      <p className="mt-1 truncate text-sm">
                        {o.gameName} · {o.packageName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{maskPlayerId(Object.values(o.playerFields ?? {})[0] ?? "")}</span> · {dateTimeTh(o.placedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tp-num text-lg font-semibold text-primary">{thb(o.price)}</p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </section>
    </PageBody>
  );
}

const RAIL: Record<string, string> = {
  fulfilled: "bg-emerald-400 shadow-[0_0_10px_rgb(52_211_153/0.8)]",
  processing: "bg-accent shadow-[0_0_10px_var(--accent)]",
  paid: "bg-primary shadow-[0_0_10px_var(--glow)]",
  pending_payment: "bg-amber-400",
  failed: "bg-destructive",
};
