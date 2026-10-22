import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { MotionRoot } from "@rentweb/ui/motion/motion-root";
import { SmoothScroll } from "@rentweb/ui/motion/smooth-scroll";
import { Preloader } from "@rentweb/ui/motion/preloader";
import { RouteProgress } from "@rentweb/ui/motion/route-transition";
import { CursorProvider } from "@rentweb/ui/fx/cursor";
import { Grain } from "@rentweb/ui/fx/grain";
import { Toaster } from "@rentweb/ui/components/sonner";
import { FloatingChat, ModeScript, RouteKind, routeKindOf, SiteFooter, SiteHeader, ThemeEffects } from "@rentweb/storefront";
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

  const fx = theme.effects;
  // public path from the proxy (x-tenant-path): server-rendered route kind (RouteKind keeps it in sync on client
  // navigation) and the first-visit preloader only on the home page — no inline route script (a 404 is client-rendered
  // from Next's error shell in dev, and React warns about every <script> it has to create there).
  const h = await headers();
  const path = h.get("x-tenant-path");
  const routeKind = path ? routeKindOf(path.split("/")[1] || null) : undefined;
  // only on full document loads: a server action, its redirect render (Next re-fetches the target internally with the
  // action's headers) or an RSC navigation / router.refresh that re-renders this layout must not add the preloader's
  // inline <script> on the client (React logs "Encountered a script tag while rendering React component" — e.g. customer
  // logout → redirect("/")). Next hides its own RSC headers from headers(), so the browser's fetch metadata decides:
  // Sec-Fetch-Dest "document" (or, without fetch metadata, an HTML Accept header).
  const dest = h.get("sec-fetch-dest");
  const docRequest = !h.get("next-action") && (dest ? dest === "document" : (h.get("accept") ?? "").includes("text/html"));
  const showPreloader = fx.preloader !== "off" && docRequest && (path == null || path === "/");
  const brandName = (theme.brand.logoText ?? runtime.config.name).trim() || runtime.config.name;

  return (
    <html lang={ctx.locale} className={`${fontClassNames} ${css.htmlClass}`} {...css.dataAttrs} data-route={routeKind} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <style id="tenant-theme" dangerouslySetInnerHTML={{ __html: css.styleTag }} />
        <ModeScript mode={theme.mode} />
      </head>
      <body className="flex min-h-dvh flex-col">
        {/* hi-end shell (docs/design/hi-end-direction.md §6.3): first-visit preloader on "/" only (first child of body) */}
        {showPreloader && fx.preloader !== "off" && <Preloader brand={brandName} logoUrl={theme.brand.logo ?? undefined} variant={fx.preloader} allowForce />}
        <MotionRoot level={fx.motionLevel}>
          <RouteKind />
          <RouteProgress />
          <SmoothScroll enabled={fx.smoothScroll} lerp={fx.motionLevel === "subtle" ? 0.08 : 0.1} />
          <CursorProvider mode={fx.cursor}>
            <ThemeEffects cursorGlow={fx.cursorGlow} scanlines={fx.scanlines} cursor={fx.cursor} />
            {fx.grain && <Grain opacity={fx.motionLevel === "subtle" ? 0.035 : 0.05} animated={fx.motionLevel !== "subtle"} />}
            <SiteHeader ctx={ctx} nav={headerNav} />
            <main className="flex-1 overflow-x-clip">{children}</main>
            <SiteFooter ctx={ctx} nav={nav.footer.length ? nav.footer : headerNav} legal={legal} />
            <FloatingChat ctx={ctx} />
            <Toaster />
          </CursorProvider>
        </MotionRoot>
      </body>
    </html>
  );
}
