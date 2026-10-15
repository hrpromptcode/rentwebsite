import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, PackageSearch } from "lucide-react";
import { Reveal } from "@rentweb/ui/motion";
import { TrackForm } from "@rentweb/module-commerce/components";
import { L } from "@rentweb/module-commerce/labels";
import { getRuntime } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { trackOrderAction } from "./actions";

export const metadata: Metadata = { title: L.trackTitle };

export default async function TrackOrderPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) notFound();
  const customer = await getCurrentCustomer(tenantId);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pb-16 md:pb-24">
        <div className="mx-auto max-w-xl">
          <Reveal>
            <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
              <PackageSearch className="size-7" />
            </span>
            <h1 className="heading-display mt-4 text-4xl font-semibold md:text-5xl">{L.trackTitle}</h1>
            <p className="mt-3 text-muted-foreground">{L.trackHint}</p>
          </Reveal>
          <Reveal delay={0.05} className="card mt-6 p-5 md:p-7">
            <TrackForm action={trackOrderAction.bind(null, tenantId)} />
          </Reveal>
          <Reveal delay={0.1} className="mt-5 text-sm text-muted-foreground">
            <Link href={customer ? "/account/orders" : `/account/login?next=${encodeURIComponent("/account/orders")}`} className="inline-flex h-11 items-center gap-1 text-primary underline-offset-4 hover:underline">
              {customer ? L.myOrders : L.loginForHistory} <ArrowRight className="size-3.5" />
            </Link>{" "}
            {!customer && L.loginForHistoryHint}
          </Reveal>
        </div>
      </section>
    </PageBody>
  );
}
