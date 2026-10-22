import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Package } from "lucide-react";
import { Reveal } from "@rentweb/ui/motion";
import { CommerceStyles, TrackForm } from "@rentweb/module-commerce/components";
import { L } from "@rentweb/module-commerce/labels";
import { getRuntime } from "@/lib/tenant";
import { getCurrentCustomer } from "@/lib/customer";
import { PageBody } from "@/components/page-body";
import { trackOrderAction } from "./actions";

export const metadata: Metadata = { title: L.trackTitle };

const ROUTE = "M8 60 C 60 10, 110 10, 150 44 S 240 88, 292 26";

/** A parcel travelling a dashed route (decorative; static under reduced motion). */
function RouteArt() {
  return (
    <div aria-hidden className="relative mx-auto h-[90px] w-[300px] text-foreground/30" style={{ "--rwc-route": `path("${ROUTE}")` } as React.CSSProperties}>
      <svg viewBox="0 0 300 90" className="absolute inset-0 size-full" fill="none">
        <path d={ROUTE} stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="rwc-dash" strokeDasharray="6 8" />
        <circle cx="8" cy="60" r="5" className="fill-foreground" />
        <circle cx="292" cy="26" r="7" className="fill-primary" />
      </svg>
      <span className="rwc-route-dot absolute top-0 left-0 size-9 rounded-full bg-foreground text-background shadow-lg">
        <Package className="size-4" />
      </span>
    </div>
  );
}

export default async function TrackOrderPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("commerce")) notFound();
  const customer = await getCurrentCustomer(tenantId);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <CommerceStyles />
      <section className="container-x pt-8 pb-20 md:pt-16 md:pb-28">
        <div className="mx-auto max-w-xl">
          <Reveal className="text-center">
            <RouteArt />
            <h1 className="mt-6 font-heading text-step-4 leading-[1.2] font-semibold text-balance">{L.trackTitle}</h1>
            <p className="mx-auto mt-3 max-w-md text-step-1 leading-relaxed text-muted-foreground">{L.trackHint}</p>
          </Reveal>
          <Reveal delay={0.08} className="card mt-8 p-5 md:mt-10 md:p-8">
            <TrackForm action={trackOrderAction.bind(null, tenantId)} />
          </Reveal>
          <Reveal delay={0.14} className="mt-5 text-center text-sm text-muted-foreground">
            <Link href={customer ? "/account/orders" : `/account/login?next=${encodeURIComponent("/account/orders")}`} className="group inline-flex h-11 items-center gap-1 text-primary underline-offset-4 hover:underline">
              {customer ? L.myOrders : L.loginForHistory} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>{" "}
            {!customer && L.loginForHistoryHint}
          </Reveal>
        </div>
      </section>
    </PageBody>
  );
}
