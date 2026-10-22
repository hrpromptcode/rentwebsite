import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cn } from "@rentweb/ui/lib/utils";
import { CtaButton, Rise, StaggerCell, StaggerList } from "@rentweb/storefront";
import { listStaff } from "@rentweb/module-booking/services";
import { INDEX_LABEL, ModuleIntro, StaffPortraitCard, lookOf } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "booking", "staff", { title: "ทีมผู้ให้บริการ" }) : {};
}

/** /staff – everyone who accepts online booking: portraits in the motif frame, credentials revealed on hover. */
export default async function StaffPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("booking")) return cmsFallback(runtime, "staff");
  const team = await tenantTx(tenantId, (tx) => listStaff(tx, tenantId, { onlineOnly: true }));
  const look = lookOf(runtime.config);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <ModuleIntro eyebrow={L.staff} index={`03 / ${INDEX_LABEL.staff}`} title="ทีมของเรา" count={team.length} countLabel="PEOPLE" lead={`${team.length} ท่าน · กดที่ชื่อเพื่อดูบริการที่ดูแล หรือจองกับคนที่คุณไว้ใจได้เลย`} />
      <section className="container-x pb-20 md:pb-32">
        {team.length === 0 ? (
          <div className="bk-panel p-12 text-center text-muted-foreground">ยังไม่มีผู้ให้บริการที่เปิดรับจองออนไลน์</div>
        ) : (
          <StaggerList className={cn("grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-8 sm:gap-y-16", team.length <= 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")} stagger={0.1}>
            {team.map((s, i) => (
              <StaggerCell key={s.id} className={cn("h-full", i % 2 === 1 && "lg:translate-y-16")}>
                <StaffPortraitCard s={s} look={look} index={i} serviceCount={s.serviceIds.length} />
              </StaggerCell>
            ))}
          </StaggerList>
        )}
        <Rise className="mt-24 flex justify-center md:mt-36">
          <CtaButton href="/book" label={L.bookNow} size="xl" />
        </Rise>
      </section>
    </PageBody>
  );
}
