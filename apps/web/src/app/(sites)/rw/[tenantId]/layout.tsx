import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MotionRoot } from "@rentweb/ui/motion";
import { Toaster } from "@rentweb/ui/components/sonner";
import { FloatingChat, ModeScript, SiteFooter, SiteHeader, ThemeEffects } from "@rentweb/storefront";
import { fontClassNames } from "@/fonts";
import { getNavigation, getRuntime, listNavPages } from "@/lib/tenant";
import { buildCtx } from "@/lib/storefront-ctx";
import { siteMetadata } from "@/lib/seo";
import "../../../globals.css";
import "@/modules";

type Params = Promise<{ tenantId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) return {};
  // site defaults incl. a generated favicon when the tenant has none (SS-10); see lib/seo.ts
  return siteMetadata(runtime);
}

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) notFound();

  const [ctx, nav, navPages] = await Promise.all([buildCtx(runtime), getNavigation(tenantId), listNavPages(tenantId)]);
  const { css, theme } = runtime;

  const headerNav = nav.header.length ? nav.header : navPages.map((p) => ({ label: p.title, href: `/${p.slug}` }));
  const legal = [
    { label: "นโยบายความเป็นส่วนตัว", href: "/privacy" },
    { label: "เงื่อนไขการใช้บริการ", href: "/terms" },
  ];

  return (
    <html lang={ctx.locale} className={`${fontClassNames} ${css.htmlClass}`} {...css.dataAttrs} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <style id="tenant-theme" dangerouslySetInnerHTML={{ __html: css.styleTag }} />
        <ModeScript mode={theme.mode} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <MotionRoot level={theme.effects.motionLevel}>
          <ThemeEffects cursorGlow={theme.effects.cursorGlow} scanlines={theme.effects.scanlines} />
          <SiteHeader ctx={ctx} nav={headerNav} />
          <main className="flex-1 overflow-x-clip">{children}</main>
          <SiteFooter ctx={ctx} nav={nav.footer.length ? nav.footer : headerNav} legal={legal} />
          <FloatingChat ctx={ctx} />
          <Toaster />
        </MotionRoot>
      </body>
    </html>
  );
}
