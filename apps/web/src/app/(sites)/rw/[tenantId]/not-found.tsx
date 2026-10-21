import Link from "next/link";
import { Button } from "@rentweb/ui/components/button";
import { Magnetic } from "@rentweb/ui/motion/magnetic";
import { RollText } from "@rentweb/ui/motion/roll-text";
import { ArrowSwap } from "@rentweb/storefront";

/**
 * 404 (§6.3): a giant "404" in the theme's accent font that floats digit by digit (a CSS glitch on the neon / stage /
 * studio / obsidian presets), a soft theme glow, Thai copy and a magnetic way home. Pure CSS motion, static under
 * reduced motion; colours, fonts and radius all come from the tenant theme.
 */
export default function SiteNotFound() {
  return (
    <section className="rw-state relative isolate flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-4 pt-28 pb-20 text-center" data-rw-state="404">
      <div className="rw-state-glow" aria-hidden />
      <p className="rw-404" aria-hidden data-text="404">
        <span style={{ "--i": 0 } as React.CSSProperties}>4</span>
        <span style={{ "--i": 1 } as React.CSSProperties}>0</span>
        <span style={{ "--i": 2 } as React.CSSProperties}>4</span>
      </p>
      <span className="mono-label mt-2 text-muted-foreground" data-script="latin" aria-hidden>
        Error 404 · Page not found
      </span>
      <h1 className="font-heading mt-5 text-step-4 font-semibold text-balance">ไม่พบหน้านี้</h1>
      <p className="mt-3 max-w-md text-pretty text-muted-foreground">ลิงก์อาจถูกย้ายหรือพิมพ์ผิด ลองกลับไปหน้าแรก</p>
      <Magnetic className="mt-9" max={10}>
        <Button asChild size="lg">
          <Link href="/">
            <span data-magnetic-inner="" className="inline-flex items-center gap-2">
              <RollText>กลับหน้าแรก</RollText>
              <ArrowSwap />
            </span>
          </Link>
        </Button>
      </Magnetic>
    </section>
  );
}
