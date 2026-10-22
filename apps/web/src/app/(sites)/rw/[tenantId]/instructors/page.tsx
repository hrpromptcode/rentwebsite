import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cn } from "@rentweb/ui/lib/utils";
import { CtaButton, Rise, StaggerCell, StaggerList } from "@rentweb/storefront";
import { listInstructors } from "@rentweb/module-booking/services";
import { INDEX_LABEL, InstructorPillCard, ModuleIntro, lookOf } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "booking", "instructors", { title: "ครูผู้สอน" }) : {};
}

/** /instructors – every active instructor as a tall pill portrait with tilt + the classes they teach. */
export default async function InstructorsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("booking")) return cmsFallback(runtime, "instructors");
  const team = await tenantTx(tenantId, (tx) => listInstructors(tx, tenantId));
  const sessions = team.reduce((n, i) => n + i.weeklySessions, 0);
  const look = lookOf(runtime.config);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <ModuleIntro eyebrow={L.instructors} index={`04 / ${INDEX_LABEL.instructors}`} title="ครูผู้สอนของเรา" count={team.length} countLabel="TEACHERS" lead={`${team.length} ท่าน · ${sessions} รอบต่อสัปดาห์ · กดที่ชื่อเพื่อดูประวัติ คลาสที่สอน และตารางสอนของแต่ละคน`} />
      <section className="container-x pb-20 md:pb-32">
        {team.length === 0 ? (
          <div className="bk-panel p-12 text-center text-muted-foreground">ยังไม่มีข้อมูลครูผู้สอน</div>
        ) : (
          <StaggerList className={cn("grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-8 sm:gap-y-16", team.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")} stagger={0.1}>
            {team.map((i, n) => (
              <StaggerCell key={i.id} className={cn("h-full", n % 2 === 1 && "lg:translate-y-14")}>
                <InstructorPillCard i={i} classes={i.classes} weeklySessions={i.weeklySessions} look={look === "default" ? "studio" : look} index={n} />
              </StaggerCell>
            ))}
          </StaggerList>
        )}
        <Rise className="bk-panel bk-soft-bg mt-24 flex flex-col items-start gap-6 p-8 md:mt-36 md:flex-row md:items-end md:justify-between md:p-12">
          <div className="max-w-xl">
            <p className="font-heading text-step-3 font-semibold leading-tight">ยังไม่รู้จะเริ่มกับใคร?</p>
            <p className="mt-3 text-sm text-muted-foreground md:text-base">ดูตารางเรียนทั้งสัปดาห์ แล้วเลือกรอบที่สะดวก ครูทุกคนดูแลผู้เริ่มต้นได้</p>
          </div>
          <CtaButton href="/schedule" label={L.weeklyTimetable} size="xl" />
        </Rise>
      </section>
    </PageBody>
  );
}
