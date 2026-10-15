import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Gamepad2, Wallet, Zap } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { thb } from "@rentweb/core/money";
import { listCustomerOrders, maskPlayerId } from "@rentweb/module-topup/services";
import { StatusBadge, dateTimeTh } from "@rentweb/module-topup/components";
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
  const orders = await tenantTx(tenantId, (tx) => listCustomerOrders(tx, tenantId, customer.id, { limit: 100 }));
  const spent = orders.filter((o) => o.status === "fulfilled" || o.status === "processing" || o.status === "paid").reduce((s, o) => s + o.price, 0);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pb-16 md:pb-24">
        <div className="mx-auto max-w-3xl">
          <Link href="/account" className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
            <ChevronLeft className="size-4" /> บัญชีของฉัน
          </Link>
          <Reveal className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="heading-display text-4xl font-semibold md:text-5xl">ประวัติการเติม</h1>
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
              <Button asChild className="h-11">
                <Link href="/games">
                  <Zap /> เติมเกม
                </Link>
              </Button>
            </div>
          </Reveal>

          {orders.length === 0 ? (
            <div className="card mt-8 flex flex-col items-center gap-3 p-10 text-center">
              <Gamepad2 className="size-10 text-muted-foreground" />
              <p className="text-muted-foreground">ยังไม่มีรายการเติม เริ่มเติมเกมแรกของคุณได้เลย</p>
              <Button asChild size="lg">
                <Link href="/games">เลือกเกม</Link>
              </Button>
            </div>
          ) : (
            <Stagger className="mt-8 grid gap-3">
              {orders.map((o) => (
                <StaggerItem key={o.id}>
                  <Link href={`/topup/${o.number}`} className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-primary/50 md:p-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{o.number}</span>
                        <StatusBadge status={o.status} />
                      </div>
                      <p className="mt-1 truncate text-sm">
                        {o.gameName} · {o.packageName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {maskPlayerId(Object.values(o.playerFields ?? {})[0] ?? "")} · {dateTimeTh(o.placedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-heading text-lg font-semibold text-primary">{thb(o.price)}</p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
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
