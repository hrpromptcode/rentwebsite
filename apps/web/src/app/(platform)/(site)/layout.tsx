import { RouteProgress, ScrollProgress, SmoothScroll } from "@rentweb/ui/motion";
import { CursorProvider, Grain } from "@rentweb/ui/fx";
import { MeshBackdrop } from "@/components/platform/mesh-backdrop";
import { SiteFooter } from "@/components/platform/site-footer";
import { SiteHeader } from "@/components/platform/site-header";

/**
 * Marketing chrome (the home page renders the first-visit Preloader itself — a <script> in the layout trips React on
 * 404s): Lenis, daybreak scroll progress, cursor with contextual labels, the pastel mesh backdrop, a whisper of grain,
 * header + footer.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SmoothScroll enabled />
      <RouteProgress />
      <ScrollProgress />
      <Grain opacity={0.026} />
      <CursorProvider mode="label">
        <div className="pf-root relative">
          <MeshBackdrop />
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
