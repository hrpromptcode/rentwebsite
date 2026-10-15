import * as React from "react";
import { cn } from "../lib/utils";

export interface MarqueeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** seconds for one loop */
  duration?: number;
  reverse?: boolean;
  pauseOnHover?: boolean;
  gap?: string;
}

/** Pure-CSS infinite marquee (no JS, respects reduced motion via global rule). */
export function Marquee({ children, className, duration = 40, reverse = false, pauseOnHover = true, gap = "2rem", ...rest }: MarqueeProps) {
  return (
    <div
      className={cn("group relative flex w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]", className)}
      style={{ "--marquee-duration": `${duration}s` } as React.CSSProperties}
      {...rest}
    >
      <div
        className={cn(
          "flex w-max shrink-0 items-center",
          reverse ? "animate-marquee-reverse" : "animate-marquee",
          pauseOnHover && "group-hover:[animation-play-state:paused]",
        )}
        style={{ gap }}
      >
        <div className="flex items-center" style={{ gap }}>
          {children}
        </div>
        <div className="flex items-center" style={{ gap }} aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
