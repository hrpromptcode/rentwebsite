import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarDays } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal, Stagger, StaggerItem } from "@rentweb/ui/motion";
import { listInstructors } from "@rentweb/module-booking/services";
import { InstructorCard } from "@rentweb/module-booking/ui";
import { L } from "@rentweb/module-booking/labels";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { cmsFallback, moduleOrCmsMetadata } from "@/lib/cms-fallback";

/** SS-13: the CMS page's title/description/og when the module is off and a CMS page owns this slug. */
export async function generateMetadata({ params }: { params: Promise<{ tenantId: string }> }): Promise<Metadata> {
  const runtime = await getRuntime((await params).tenantId);
  return runtime ? moduleOrCmsMetadata(runtime, "booking", "instructors", { title: "ครูผู้สอน" }) : {};
}

/** /instructors – every active instructor with the classes they teach. */
export default async function InstructorsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  if (!runtime.config.modules.includes("booking")) return cmsFallback(runtime, "instructors");
  const team = await tenantTx(tenantId, (tx) => listInstructors(tx, tenantId));
  const sessions = team.reduce((n, i) => n + i.weeklySessions, 0);

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{L.instructors}</p>
          <h1 className="heading-display mt-3 text-4xl font-semibold md:text-6xl">ครูผู้สอนของเรา</h1>
          <p className="mt-4 text-muted-foreground">
            {team.length} ท่าน · {sessions} รอบต่อสัปดาห์ · กดที่ชื่อเพื่อดูประวัติ คลาสที่สอน และตารางสอนของแต่ละคน
          </p>
        </Reveal>
        {team.length === 0 ? (
          <div className="card mt-10 p-10 text-center text-muted-foreground">ยังไม่มีข้อมูลครูผู้สอน</div>
        ) : (
          <Stagger className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {team.map((i) => (
              <StaggerItem key={i.id} className="h-full">
                <InstructorCard i={i} classes={i.classes} weeklySessions={i.weeklySessions} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
        <Reveal className="mt-12 flex flex-col items-center gap-3 rounded-[var(--radius-xl)] bg-primary-soft p-8 text-center md:flex-row md:justify-between md:text-left">
          <div>
            <p className="font-heading flex items-center justify-center gap-2 text-xl font-semibold md:justify-start">
              <CalendarDays className="size-5 text-primary" /> ยังไม่รู้จะเริ่มกับใคร?
            </p>
            <p className="mt-1 text-sm text-muted-foreground">ดูตารางเรียนทั้งสัปดาห์ แล้วเลือกรอบที่สะดวก ครูทุกคนดูแลผู้เริ่มต้นได้</p>
          </div>
          <Button asChild size="lg">
            <Link href="/schedule">
              {L.weeklyTimetable} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </Reveal>
      </section>
    </PageBody>
  );
}
