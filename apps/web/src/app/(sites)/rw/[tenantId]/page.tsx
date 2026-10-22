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
    // no published home yet: a calm "opening soon" poster in the shop's own theme (tokens only, no motion needed)
    const name = runtime.config.name;
    return (
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_70%_30%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_70%),radial-gradient(45%_50%_at_15%_85%,color-mix(in_oklab,var(--accent)_14%,transparent),transparent_70%)]" />
        <div className="container-x flex min-h-[78svh] flex-col justify-end pt-32 pb-16 md:pb-24">
          <p className="mono-label flex items-center gap-3 text-muted-foreground">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inset-0 rounded-full bg-primary motion-safe:animate-ping" />
              <span className="relative size-2 rounded-full bg-primary" />
            </span>
            Opening soon
          </p>
          <h1 className="mt-6 max-w-5xl font-heading text-step-6 leading-[1.15] font-semibold text-balance" data-script={/[฀-๿]/.test(name) ? "thai" : "latin"}>
            {name}
          </h1>
          <div aria-hidden className="mt-10 h-px w-full bg-border" />
          <p className="mt-6 max-w-md text-step-1 leading-relaxed text-muted-foreground">เว็บไซต์กำลังอยู่ระหว่างการตั้งค่า กลับมาใหม่เร็ว ๆ นี้</p>
        </div>
      </section>
    );
  }

  return (
    <PageBody theme={runtime.theme} sections={page.sections}>
      <RenderSections sections={page.sections} ctx={ctx} pageTitle={runtime.config.name} />
    </PageBody>
  );
}
