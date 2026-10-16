import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { listStaff } from "@rentweb/module-booking/services";
import { StaffCard } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "booking", "staff", { title: "ทีมผู้ให้บริการ" }) : {};
}

/** /staff – everyone who accepts online booking. */
export default async function StaffPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("booking")) return cmsFallback(runtime, "staff");
  const team = await tenantTx(tenantId, (tx) => listStaff(tx, tenantId, { onlineOnly: true }));

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{L.staff}</p>
          <h1 className="heading-display mt-3 text-4xl font-semibold md:text-6xl">ทีมของเรา</h1>
          <p className="mt-4 text-muted-foreground">{team.length} ท่าน · กดที่ชื่อเพื่อดูบริการที่ดูแล หรือจองกับคนที่คุณไว้ใจได้เลย</p>
        </Reveal>
        {team.length === 0 ? (
          <div className="card mt-10 p-10 text-center text-muted-foreground">ยังไม่มีผู้ให้บริการที่เปิดรับจองออนไลน์</div>
        ) : (
          <Stagger className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((s) => (
              <StaggerItem key={s.id} className="h-full">
                <div className="flex h-full flex-col gap-3">
                  <StaffCard s={{ ...s, serviceCount: s.serviceIds.length }} className="flex-1" />
                  <Button asChild variant="outline" className="h-11">
                    <Link href={`/book?staff=${encodeURIComponent(s.slug)}`}>{L.bookWith(s.name)}</Link>
                  </Button>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        )}
        <Reveal className="mt-12 text-center">
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
