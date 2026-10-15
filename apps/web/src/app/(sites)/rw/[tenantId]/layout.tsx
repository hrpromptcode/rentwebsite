import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MotionRoot } from "@rentweb/ui/motion";
import { Toaster } from "@rentweb/ui/components/sonner";
import { FloatingChat, ModeScript, SiteFooter, SiteHeader, ThemeEffects } from "@rentweb/storefront";
import { fontClassNames } from "@/fonts";
import { getNavigation, getRuntime, listNavPages } from "@/lib/tenant";
import { buildCtx } from "@/lib/storefront-ctx";
import "../../../globals.css";
import "@/modules";

type Params = Promise<{ tenantId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenantId } = await params;
  const runtime = await getRuntime(tenantId);
  if (!runtime) return {};
  const { config, theme } = runtime;
  const seo = (config.settings.seo as { title?: string; description?: string } | undefined) ?? {};
  const title = seo.title ?? config.name;
  const description = seo.description ?? (config.settings.tagline as string | undefined) ?? undefined;
  return {
    title: { default: title, template: `%s · ${config.name}` },
    description,
    icons: theme.brand.favicon ? { icon: theme.brand.favicon } : undefined,
    openGraph: { title, description, siteName: config.name, images: theme.brand.ogImage ? [theme.brand.ogImage] : undefined, locale: config.locale === "th" ? "th_TH" : "en_US", type: "website" },
    robots: config.status === "trialing" ? { index: false, follow: false } : undefined,
  };
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
    <html lang={ctx.locale} className={`${fontClassNames} ${css.htmlClass}`} {...css.dataAttrs} suppressHydrationWarning>
      <head>
        <style id="tenant-theme" dangerouslySetInnerHTML={{ __html: css.styleTag }} />
        <ModeScript mode={theme.mode} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <MotionRoot level={theme.effects.motionLevel}>
          <ThemeEffects cursorGlow={theme.effects.cursorGlow} scanlines={theme.effects.scanlines} />
          <SiteHeader ctx={ctx} nav={headerNav} />
          <main className="flex-1">{children}</main>
          <SiteFooter ctx={ctx} nav={nav.footer.length ? nav.footer : headerNav} legal={legal} />
          <FloatingChat ctx={ctx} />
          <Toaster />
        </MotionRoot>
      </body>
    </html>
  );
}
