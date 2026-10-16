import { notFound } from "next/navigation";
import { RenderSections } from "@rentweb/storefront";
import { getPublishedPage, getRuntime } from "@/lib/tenant";
import { buildCtx } from "@/lib/storefront-ctx";
import { PageBody } from "@/components/page-body";

export default async function HomePage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  const [ctx, page] = await Promise.all([buildCtx(runtime), getPublishedPage(tenantId, "home")]);

  if (!page) {
    return (
      <section className="container-x flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 className="heading-display text-5xl font-semibold md:text-7xl">{runtime.config.name}</h1>
        <p className="mt-4 max-w-md text-muted-foreground">เว็บไซต์กำลังอยู่ระหว่างการตั้งค่า กลับมาใหม่เร็ว ๆ นี้</p>
      </section>
    );
  }

  return (
    <PageBody theme={runtime.theme} sections={page.sections}>
      <RenderSections sections={page.sections} ctx={ctx} pageTitle={runtime.config.name} />
    </PageBody>
  );
}
