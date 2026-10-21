"use client";

import * as React from "react";
import { Lock } from "lucide-react";

/** Marks every [data-tile] inside as seen (data-seen="true") once it enters the viewport — drives the CSS micro-demos. */
export function SeenScope({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const tiles = Array.from(root.querySelectorAll<HTMLElement>("[data-tile]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.seen = "true";
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.35 },
    );
    tiles.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

export interface SwatchSet {
  key: string;
  name: string;
  background: string;
  foreground: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  surface: string;
  muted: string;
}

/** "ปรับธีมเอง": five swatch sets recolour a mini storefront live through CSS variables (the customisability proof). */
export function ThemeDemo({ sets, image }: { sets: SwatchSet[]; image: string }) {
  const [i, setI] = React.useState(0);
  const s = sets[i] ?? sets[0]!;
  const vars = {
    "--d-bg": s.background,
    "--d-fg": s.foreground,
    "--d-primary": s.primary,
    "--d-primary-fg": s.primaryForeground,
    "--d-accent": s.accent,
    "--d-surface": s.surface,
    "--d-muted": s.muted,
  } as React.CSSProperties;
  return (
    <div className="flex h-full flex-col gap-5">
      <div
        className="relative flex-1 overflow-hidden rounded-2xl ring-1 ring-black/10 transition-[background-color,color] duration-700"
        style={{ ...vars, background: "var(--d-bg)", color: "var(--d-fg)" }}
        aria-label={`ตัวอย่างหน้าร้านในธีม ${s.name}`}
        role="img"
      >
        <div className="flex items-center justify-between px-5 py-3.5 text-[0.8rem]" style={{ borderBottom: "1px solid color-mix(in oklab, var(--d-fg) 12%, transparent)" }}>
          <span className="font-semibold tracking-tight">My Shop</span>
          <span className="hidden gap-4 opacity-70 sm:flex">
            <span>สินค้า</span>
            <span>เกี่ยวกับเรา</span>
            <span>ติดต่อ</span>
          </span>
          <span className="rounded-full px-3 py-1 text-[0.72rem] font-semibold transition-colors duration-700" style={{ background: "var(--d-primary)", color: "var(--d-primary-fg)" }}>
            ตะกร้า (2)
          </span>
        </div>
        <div className="grid grid-cols-5 gap-4 p-5">
          <div className="col-span-3 flex flex-col justify-center gap-3">
            <span className="w-fit rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold transition-colors duration-700" style={{ background: "color-mix(in oklab, var(--d-accent) 22%, transparent)", color: "var(--d-fg)" }}>
              คอลเลกชันใหม่
            </span>
            <p className="text-[clamp(1.2rem,0.8rem+1.4vw,2rem)] font-semibold leading-[1.25]">สวยในแบบ ของคุณเอง</p>
            <p className="text-[0.78rem] leading-[1.6] opacity-70">เปลี่ยนสีทั้งร้านได้ในคลิกเดียว</p>
            <span className="mt-1 w-fit rounded-full px-4 py-2 text-[0.75rem] font-semibold transition-colors duration-700" style={{ background: "var(--d-primary)", color: "var(--d-primary-fg)" }}>
              ช้อปเลย →
            </span>
          </div>
          <div className="col-span-2 overflow-hidden rounded-xl transition-colors duration-700" style={{ background: "var(--d-surface)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="aspect-[4/5] size-full object-cover" loading="lazy" decoding="async" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 px-5 pb-5">
          {[0, 1, 2].map((k) => (
            <div key={k} className="rounded-lg p-2.5 transition-colors duration-700" style={{ background: "var(--d-muted)" }}>
              <div className="h-9 rounded-md transition-colors duration-700" style={{ background: k === 1 ? "var(--d-accent)" : "color-mix(in oklab, var(--d-primary) 30%, var(--d-surface))" }} />
              <div className="mt-2 h-1.5 w-3/4 rounded-full opacity-40" style={{ background: "var(--d-fg)" }} />
            </div>
          ))}
        </div>
      </div>
      <div role="radiogroup" aria-label="เลือกชุดสีตัวอย่าง" className="flex flex-wrap items-center gap-2">
        {sets.map((set, k) => (
          <button
            key={set.key}
            type="button"
            role="radio"
            aria-checked={k === i}
            onClick={() => setI(k)}
            className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-3 text-sm transition-colors aria-checked:border-foreground aria-checked:bg-foreground/5"
          >
            <span className="flex -space-x-1.5" aria-hidden="true">
              {[set.background, set.primary, set.accent].map((c, j) => (
                <span key={j} className="size-4 rounded-full ring-2 ring-background" style={{ background: c }} />
              ))}
            </span>
            {set.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "ฟอนต์ไทย": the specimen cycles through Thai faces while the tile is on screen. */
export function FontCycler({ fonts, word = "สวัสดี" }: { fonts: { key: string; name: string }[]; word?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || fonts.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !timer) timer = setInterval(() => setI((v) => (v + 1) % fonts.length), 1400);
      else if (!e?.isIntersecting && timer) {
        clearInterval(timer);
        timer = undefined;
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, [fonts.length]);
  const f = fonts[i] ?? fonts[0]!;
  return (
    <div ref={ref} className="flex h-full flex-col justify-between gap-6">
      <p className="text-[clamp(3.4rem,2rem+4vw,5.6rem)] leading-[1.3]" style={{ fontFamily: `var(--font-${f.key}), var(--font-display)` }} aria-hidden="true">
        {word}
      </p>
      <p className="mono-label flex items-center justify-between text-muted-foreground" data-script="latin" aria-hidden="true">
        <span className="text-foreground">{f.name}</span>
        <span>
          {String(i + 1).padStart(2, "0")} / {String(fonts.length).padStart(2, "0")}
        </span>
      </p>
    </div>
  );
}

/** "โดเมนของคุณ": types the domain once the tile is seen, then the lock (SSL) appears. */
export function DomainTyper({ domain = "yourshop.co.th" }: { domain?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [n, setN] = React.useState(domain.length);
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setN(0);
    setArmed(true);
    let t: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      let k = 0;
      t = setInterval(() => {
        k += 1;
        setN(k);
        if (k >= domain.length) clearInterval(t);
      }, 90);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => {
      io.disconnect();
      clearInterval(t);
    };
  }, [domain]);
  const done = n >= domain.length;
  return (
    <div ref={ref} className="flex items-center gap-3 rounded-full border border-border bg-background/60 px-4 py-3 font-mono text-[0.95rem]">
      <span className={`grid size-7 place-items-center rounded-full transition-all duration-500 ${done ? "scale-100 bg-emerald-400/15 text-emerald-300" : "scale-75 bg-muted text-muted-foreground"}`} aria-hidden="true">
        <Lock className="size-3.5" />
      </span>
      <span className="text-muted-foreground" aria-hidden="true">
        https://
      </span>
      <span className={`text-foreground ${armed && !done ? "pf-caret" : ""}`} aria-hidden="true">
        {domain.slice(0, n)}
      </span>
      <span className="sr-only">https://{domain}</span>
    </div>
  );
}
