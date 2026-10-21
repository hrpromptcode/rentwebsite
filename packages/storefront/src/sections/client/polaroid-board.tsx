"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@rentweb/ui/lib/utils";

export interface PolaroidItem {
  url: string;
  alt: string;
  caption?: string;
  /** seeded layout from the server: left/top in % of the board, rotation in deg, depth layer */
  x: number;
  y: number;
  r: number;
  z: number;
}

/**
 * Scattered instant prints you can pick up and throw (motion drag, constrained to the board). Positions come from the
 * server (seeded), so SSR and hydration agree. The last-grabbed print comes to the front. Phones / reduced motion /
 * `still` = a tidy 2-column stack of prints with their tilt (no drag).
 */
export function PolaroidBoard({ items, still = false, hint = "ลากรูปเล่นได้" }: { items: PolaroidItem[]; still?: boolean; hint?: string }) {
  const board = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [top, setTop] = React.useState<number | null>(null);
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const up = () => setWide(mq.matches);
    up();
    mq.addEventListener("change", up);
    return () => mq.removeEventListener("change", up);
  }, []);
  const drag = wide && !reduce && !still;

  return (
    <div>
      <div
        ref={board}
        data-cursor={drag ? "drag" : undefined}
        data-cursor-label={drag ? "ลาก" : undefined}
        className={cn("relative mx-auto w-full", "grid grid-cols-2 gap-5 sm:gap-8 md:block md:h-[min(86svh,820px)]")}
      >
        {items.map((it, i) => (
          <motion.figure
            key={i}
            drag={drag}
            dragConstraints={board}
            dragElastic={0.18}
            dragMomentum
            whileDrag={{ scale: 1.06, rotate: 0, boxShadow: "0 40px 80px -30px rgba(0,0,0,.45)" }}
            onPointerDown={() => setTop(i)}
            initial={false}
            className={cn("rw-polaroid md:absolute md:top-[var(--y)] md:left-[var(--x)] md:w-[clamp(11rem,19vw,17rem)]", !drag && "cursor-default")}
            style={{ "--x": `${it.x}%`, "--y": `${it.y}%`, rotate: it.r, zIndex: top === i ? 30 : 10 + it.z } as React.ComponentProps<typeof motion.figure>["style"]}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.url} alt={it.alt} draggable={false} loading="lazy" decoding="async" className="pointer-events-none aspect-square w-full rounded-[2px] object-cover select-none" />
            {it.caption && <figcaption className="mt-3 truncate px-1 text-center text-sm font-medium">{it.caption}</figcaption>}
          </motion.figure>
        ))}
      </div>
      {drag && <p className="mono-label mt-6 text-center text-muted-foreground" data-script="thai">{hint}</p>}
    </div>
  );
}
