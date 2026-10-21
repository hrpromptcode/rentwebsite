"use client";

import * as React from "react";
import { useScrollEffect } from "@rentweb/ui/motion";
import type { PresetView } from "./platform-data";

/**
 * /templates/[key] colour playground (§4.5 #4): the recommended presets are clickable swatch sets; choosing one
 * recolours the device stage glow (CSS vars on the scope) and the palette tiles. Server-rendered with the template's
 * default preset, so SSR and hydration agree.
 */
const Ctx = React.createContext<{ presets: PresetView[]; active: number; setActive: (i: number) => void }>({ presets: [], active: 0, setActive: () => {} });

export function PresetScope({ presets, children, className }: { presets: PresetView[]; children: React.ReactNode; className?: string }) {
  const [active, setActive] = React.useState(0);
  const p = presets[active] ?? presets[0];
  const style = p ? ({ "--dev-glow": p.primary, "--tpl-accent": p.accent, "--tpl-primary": p.primary } as React.CSSProperties) : undefined;
  const value = React.useMemo(() => ({ presets, active, setActive }), [presets, active]);
  return (
    <Ctx.Provider value={value}>
      <div className={className} style={style}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function PresetButtons() {
  const { presets, active, setActive } = React.useContext(Ctx);
  return (
    <div role="radiogroup" aria-label="ชุดสีที่แนะนำสำหรับเทมเพลตนี้" className="flex flex-wrap gap-2">
      {presets.map((p, i) => (
        <button
          key={p.key}
          type="button"
          role="radio"
          aria-checked={i === active}
          onClick={() => setActive(i)}
          className="inline-flex min-h-12 items-center gap-3 rounded-full border border-border px-4 text-sm font-medium transition-colors duration-300 hover:border-foreground aria-checked:border-foreground aria-checked:bg-foreground/5"
        >
          <span className="flex -space-x-1.5" aria-hidden="true">
            {[p.background, p.primary, p.accent, p.foreground].map((c, k) => (
              <span key={k} className="size-5 rounded-full ring-2 ring-background" style={{ background: c }} />
            ))}
          </span>
          {p.name}
          {i === 0 ? <span className="mono-label text-muted-foreground" data-script="latin">DEFAULT</span> : null}
        </button>
      ))}
    </div>
  );
}

export function PaletteTiles() {
  const { presets, active } = React.useContext(Ctx);
  const p = presets[active] ?? presets[0];
  if (!p) return null;
  const tiles: [string, string][] = [
    ["Primary", p.primary],
    ["Accent", p.accent],
    ["Secondary", p.secondary],
    ["Surface", p.surface],
    ["Background", p.background],
    ["Foreground", p.foreground],
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label={`ชุดสี ${p.name}`}>
      {tiles.map(([label, hex]) => (
        <li key={label} className="overflow-hidden rounded-2xl ring-1 ring-border">
          <div className="aspect-[4/3] transition-colors duration-700" style={{ background: hex }} />
          <div className="flex items-center justify-between gap-2 bg-card px-3 py-2.5">
            <span className="mono-label text-muted-foreground" data-script="latin">
              {label}
            </span>
            <span className="font-mono text-xs uppercase">{hex}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PresetName() {
  const { presets, active } = React.useContext(Ctx);
  return <>{presets[active]?.name ?? ""}</>;
}

/** translateY parallax by section progress (px per viewport travelled); transform only, static under reduced motion */
export function ParallaxY({ children, speed = 60, className }: { children: React.ReactNode; speed?: number; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const y = React.useRef(0);
  const [on, setOn] = React.useState(false);
  React.useEffect(() => setOn(!window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  useScrollEffect(
    ref,
    {
      read: () => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const t = (r.top + r.height / 2 - vh / 2) / vh; // -1..1 around the viewport centre
        y.current = Math.max(-1.2, Math.min(1.2, t)) * speed;
      },
      write: () => {
        const el = ref.current;
        if (el) el.style.transform = `translate3d(0, ${y.current.toFixed(1)}px, 0)`;
      },
    },
    { enabled: on },
  );
  return (
    <div ref={ref} className={className} style={{ willChange: on ? "transform" : undefined }}>
      {children}
    </div>
  );
}
