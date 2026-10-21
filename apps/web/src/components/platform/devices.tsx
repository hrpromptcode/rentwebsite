import { cn } from "@rentweb/ui/lib/utils";
import { ParallaxY } from "./preset-scope";

/**
 * CSS-3D device pair (laptop + phone, perspective 1400px, rotateY −14°) used by the sticky story and template pages.
 * Server-safe; `glow` tints the screen light / floor shadow (a template preset's primary).
 */
export function DevicePair({
  desktop,
  mobile,
  alt,
  glow,
  autoscroll,
  className,
  eager,
  parallax,
}: {
  desktop: string;
  mobile: string;
  alt: string;
  glow?: string;
  /** "loop" slowly pans a long screenshot inside the laptop */
  autoscroll?: "loop" | "hover";
  className?: string;
  eager?: boolean;
  /** laptop and phone drift at different speeds while scrolling */
  parallax?: boolean;
}) {
  const wrap = (node: React.ReactNode, speed: number) =>
    parallax ? (
      <ParallaxY speed={speed} className="absolute inset-0 [transform-style:preserve-3d]">
        {node}
      </ParallaxY>
    ) : (
      node
    );
  return (
    <div
      className={cn("pf-devices", className)}
      style={glow ? ({ "--dev-glow": glow } as React.CSSProperties) : undefined}
    >
      <div className="pf-devices__floor" aria-hidden="true" />
      <div className="pf-devices__rig">
        {wrap(
          <div className="pf-laptop">
            <div className="pf-laptop__lid">
              <div
                className={cn("pf-laptop__screen", autoscroll && "pf-autoscroll")}
                data-autoscroll={autoscroll === "loop" ? "loop" : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={desktop}
                  alt={alt}
                  width={1440}
                  height={900}
                  loading={eager ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                />
              </div>
            </div>
            <div className="pf-laptop__base" aria-hidden="true" />
          </div>,
          -24,
        )}
        {wrap(
          <div className="pf-phone" aria-hidden="true">
            <div className="pf-phone__screen">
              <span className="pf-phone__notch" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mobile}
                alt=""
                width={390}
                height={844}
                loading={eager ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
              />
            </div>
          </div>,
          -90,
        )}
      </div>
    </div>
  );
}
