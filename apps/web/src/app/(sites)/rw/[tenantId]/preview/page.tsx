import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, pages, type SectionJson } from "@rentweb/db";
import { RenderSections } from "@rentweb/storefront";
import { verifyPreviewToken } from "@rentweb/core/preview-token";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { buildCtx } from "@/lib/storefront-ctx";
import { PageBody } from "@/components/page-body";
import { CmsPageView } from "../[...slug]/cms-page-view";

/**
 * ADMIN_B2-02: draft preview of one CMS page. The admin's "ดูตัวอย่าง" links to `<storefront>/preview?token=…`
 * (tenant host; proxy.ts rewrites it here — `preview` is a reserved page slug). The signed token names the tenant and
 * the page; we render that page's DRAFT (pages.sections + draft_meta title) inside the normal tenant shell.
 * Never cached (per-request token check) and never indexed. Bad / expired / other-tenant tokens are a plain 404.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ตัวอย่างฉบับร่าง",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

type Props = { params: Promise<{ tenantId: string }>; searchParams: Promise<{ token?: string | string[] }> };

export default async function PreviewPage({ params, searchParams }: Props) {
  const { tenantId } = await params;
  const raw = (await searchParams).token;
  const check = verifyPreviewToken(Array.isArray(raw) ? raw[0] : raw, { expectedTenantId: tenantId });
  if (!check.ok) notFound();
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();
  const [row] = await tenantTx(tenantId, (tx) =>
    tx.select().from(pages).where(and(eq(pages.tenantId, tenantId), eq(pages.id, check.pageId))).limit(1),
  );
  if (!row) notFound();
  const title = row.draftMeta?.title ?? row.title;
  const sections = (row.sections ?? []) as SectionJson[]; // the DRAFT, not publishedSections
  const isHome = row.slug === "home";
  const ctx = isHome ? await buildCtx(runtime) : null;
  return (
    <>
      {/* sticks just under whichever header variant is sticky (--header-h is 0px when the header scrolls away) */}
      <div
        role="status"
        data-preview-banner
        className="sticky top-[var(--header-h,0px)] z-30 border-b border-amber-300/60 bg-amber-50/90 px-4 py-2.5 text-amber-950 backdrop-blur-md dark:border-amber-400/25 dark:bg-amber-950/80 dark:text-amber-100"
      >
        <p className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-sm leading-relaxed">
          <span className="inline-flex items-center gap-2 font-mono text-[0.6875rem] font-medium tracking-[0.12em] uppercase">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inset-0 rounded-full bg-amber-500 motion-safe:animate-ping" />
              <span className="relative size-2 rounded-full bg-amber-500" />
            </span>
            Draft
          </span>
          <span>ตัวอย่างฉบับร่าง “{title}” — ยังไม่เผยแพร่ ลูกค้ายังไม่เห็นการแก้ไขนี้</span>
        </p>
      </div>
      {isHome ? (
        <PageBody theme={runtime.theme} sections={sections}>
          <RenderSections sections={sections} ctx={ctx!} pageTitle={runtime.config.name} />
        </PageBody>
      ) : (
        <CmsPageView runtime={runtime} page={{ slug: row.slug, title, kind: row.kind, sections }} />
      )}
    </>
  );
}
