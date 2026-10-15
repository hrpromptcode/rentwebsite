"use client";

import * as React from "react";
import { animate, useInView, useReducedMotion } from "motion/react";

export function Counter({
  to,
  from = 0,
  duration = 1.6,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
  locale = "th-TH",
}: {
  to: number;
  from?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  locale?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const fmt = React.useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: decimals, minimumFractionDigits: decimals }), [locale, decimals]);

  React.useEffect(() => {
    if (!ref.current) return;
    if (!inView) return;
    if (reduce) {
      ref.current.textContent = `${prefix}${fmt.format(to)}${suffix}`;
      return;
    }
    const controls = animate(from, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = `${prefix}${fmt.format(v)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [inView, from, to, duration, prefix, suffix, fmt, reduce]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {fmt.format(from)}
      {suffix}
    </span>
  );
}
