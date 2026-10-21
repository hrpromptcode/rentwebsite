import { RouteProgress, SmoothScroll } from "@rentweb/ui/motion";
import { CursorProvider, Grain } from "@rentweb/ui/fx";
import { SiteFooter } from "@/components/platform/site-footer";
import { SiteHeader } from "@/components/platform/site-header";

/** Marketing chrome (the home page renders the first-visit Preloader itself — a <script> in the layout trips React on 404s): Lenis, cursor with contextual labels, grain, header + footer. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SmoothScroll enabled />
      <RouteProgress />
      <Grain opacity={0.045} />
      <CursorProvider mode="label">
        <div className="pf-root relative">
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-5 focus:py-3 focus:text-primary-foreground">
            ข้ามไปเนื้อหาหลัก
          </a>
          <SiteHeader />
          <main id="main" tabIndex={-1} className="outline-none">
            {children}
          </main>
          <SiteFooter />
        </div>
      </CursorProvider>
    </>
  );
}
