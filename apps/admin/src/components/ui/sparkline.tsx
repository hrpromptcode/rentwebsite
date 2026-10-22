import * as React from "react";
import { cn } from "@rentweb/ui/lib/utils";

/**
 * Tiny trend line for KPI tiles (server component, no JS). A smoothed line + soft area in `currentColor`; the line draws
 * itself in (pathLength / dash offset, CSS `.adm-spark`) and the last point gets a pulse dot. Decorative: the numbers it
 * summarises are always printed as text next to it, so it is aria-hidden.
 */
export function Sparkline({ uid, values, className, height = 36, width = 120 }: { uid: string; values: number[]; className?: string; height?: number; width?: number }) {
  const n = values.length;
  if (n < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const padY = 4;
  const pts = values.map((v, i) => [(i / (n - 1)) * width, padY + (1 - (v - min) / span) * (height - padY * 2)] as const);
  // Catmull-Rom → cubic Bézier (tension 0.5) for a calm, non-jagged line
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(n - 1, i + 2)]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = Math.min(height - padY, Math.max(padY, p1[1] + (p2[1] - p0[1]) / 6));
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = Math.min(height - padY, Math.max(padY, p2[1] - (p3[1] - p1[1]) / 6));
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const area = `${d} L${width},${height} L0,${height} Z`;
  const last = pts[n - 1]!;
  const flat = max === min;
  const id = uid.replace(/[^a-z0-9]/gi, "");
  return (
    <span className={cn("adm-spark", flat && "is-flat", className)} aria-hidden="true">
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" focusable="false">
      <defs>
        <linearGradient id={`sg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="adm-spark-area" d={area} fill={`url(#sg${id})`} />
      <path className="adm-spark-line" d={d} pathLength={1} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
      <span className="adm-spark-dot" style={{ top: `${((last[1] / height) * 100).toFixed(1)}%` }} />
    </span>
  );
}

/**
 * 14-day bar chart (server component): one bar per day, today highlighted; bars grow in with a stagger (CSS
 * `.adm-bars`). The table of values is rendered sr-only for screen readers.
 */
export function DayBars({ values, labels, format, caption, className }: { values: number[]; labels: string[]; format: (v: number) => string; caption: string; className?: string }) {
  const max = Math.max(1, ...values);
  return (
    <figure className={cn("adm-bars", className)}>
      <div className="adm-bars-plot" aria-hidden="true">
        {values.map((v, i) => (
          <div key={i} className="adm-bar-col" style={{ "--i": i } as React.CSSProperties} data-today={i === values.length - 1 ? "" : undefined} title={`${labels[i]} · ${format(v)}`}>
            <span className="adm-bar" style={{ "--h": `${Math.max(v > 0 ? 4 : 1.5, (v / max) * 100)}%` } as React.CSSProperties} />
          </div>
        ))}
      </div>
      <div className="adm-bars-axis" aria-hidden="true">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor(labels.length / 2)]}</span>
        <span>วันนี้</span>
      </div>
      <figcaption className="sr-only">
        {caption}: {values.map((v, i) => `${labels[i]} ${format(v)}`).join(", ")}
      </figcaption>
    </figure>
  );
}
