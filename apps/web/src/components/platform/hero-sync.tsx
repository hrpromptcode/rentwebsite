"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarCheck, QrCode, ReceiptText, TrendingUp } from "lucide-react";
import { WordCycler } from "@rentweb/ui/motion/word-cycler";
import { whenPreloaded } from "@rentweb/ui/motion/prefs";
import { cn } from "@rentweb/ui/lib/utils";
import { HERO_WORDS } from "./hero-data";
import { tg } from "./thai";

/**
 * Hero choreography: the WordCycler's word drives the live device stack — the browser and the phone
 * page-wipe to the showcase screenshots of the template that matches the word (HERO_KEYS in hero-data.ts).
 */
const Ctx = React.createContext<{ word: number; setWord: (i: number) => void }>({ word: 0, setWord: () => {} });

export function HeroSync({ children }: { children: React.ReactNode }) {
  const [word, setWord] = React.useState(0);
  const value = React.useMemo(() => ({ word, setWord }), [word]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** "เว็บสำหรับ [word]" — the slot's brand-gradient underline follows the measured word width and re-draws on every change. */
export function HeroCycler({ className }: { className?: string }) {
  const { word, setWord } = React.useContext(Ctx);
  return (
    <span className="pf-cycle" data-par={word % 2} style={{ ["--w" as string]: word }}>
      <WordCycler words={HERO_WORDS} interval={2600} mode="roll" className={className} onChange={setWord} />
    </span>
  );
}

/**
 * Hero headline: two lines rise out of a mask (CSS transitions, started once the first-visit preloader is gone);
 * "5 นาที" is shimmering sunrise gradient text. Before hydration the lines sit 46% risen (painted → early LCP).
 */
export function HeroTitle({ id, className }: { id: string; className?: string }) {
  const [state, setState] = React.useState<"idle" | "in">("idle");
  React.useEffect(() => {
    let alive = true;
    whenPreloaded(2200).then(() => {
      if (alive) requestAnimationFrame(() => setState("in"));
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <h1 id={id} className={cn("pf-h1", className)} data-state={state}>
      <span className="pf-h1__line">
        <span className="pf-h1__in" style={{ ["--i" as string]: 0 }}>
          {tg("เปิดเว็บธุรกิจ")}
        </span>
      </span>
      <span className="pf-h1__line">
        <span className="pf-h1__in" style={{ ["--i" as string]: 1 }}>
          {tg("ของคุณ ใน ")}
          <span className="pf-grad-text pf-shimmer">5 นาที</span>
        </span>
      </span>
    </h1>
  );
}

export interface HeroShot {
  key: string;
  desktop: string;
  mobile: string;
  brand: string;
}

type ChipIcon = "pay" | "cal" | "line" | "slip" | "trend";
const CHIPS: { t: string; d: string; icon: ChipIcon; bg: string; side: "l" | "r"; pos: React.CSSProperties; z: number; o: string; still: boolean; mobile: boolean }[] = [
  { t: "ชำระเงินสำเร็จ ฿1,290", d: "PromptPay · เข้าบัญชีร้านแล้ว", icon: "pay", bg: "linear-gradient(135deg,#0ec0dc,#1561b7)", side: "l", pos: { left: "-6%", top: "-1%" }, z: 170, o: "0% 100%", still: true, mobile: true },
  { t: "จองคิวแล้ว 14:30 น.", d: "นวดไทย 90 นาที · พรุ่งนี้", icon: "cal", bg: "linear-gradient(135deg,#1e8fd8,#0ec0dc)", side: "r", pos: { right: "1%", top: "4%" }, z: 150, o: "100% 100%", still: false, mobile: false },
  { t: "LINE: มีออเดอร์ใหม่ 🛍", d: "#1024 · 2 รายการ · ฿2,480", icon: "line", bg: "#06c755", side: "l", pos: { left: "-9%", top: "58%" }, z: 210, o: "0% 0%", still: true, mobile: true },
  { t: "ตรวจสลิปผ่าน ✓", d: "ยอดตรง · บัญชีปลายทางถูกต้อง", icon: "slip", bg: "linear-gradient(135deg,#34d399,#0ec0dc)", side: "l", pos: { left: "26%", bottom: "-2%" }, z: 240, o: "50% 100%", still: false, mobile: false },
  { t: "ยอดขายวันนี้ +32%", d: "เทียบกับเมื่อวาน", icon: "trend", bg: "linear-gradient(135deg,#ff9f5a,#ff2e7e)", side: "r", pos: { right: "-7%", top: "33%" }, z: 260, o: "100% 0%", still: true, mobile: true },
];

function ChipGlyph({ icon }: { icon: ChipIcon }) {
  if (icon === "line") return <span>LINE</span>;
  const Icon = icon === "pay" ? QrCode : icon === "cal" ? CalendarCheck : icon === "slip" ? ReceiptText : TrendingUp;
  return <Icon strokeWidth={2.2} aria-hidden="true" />;
}

/**
 * Live 3D device stack: a browser window + phone on a tilted rig that follows the pointer (lerped, CSS vars only), screens
 * page-wipe to the template of the current word, glass notification chips pop in on a loop at different depths, and a
 * pastel halo floats behind. Touch devices get a slow idle sway instead of pointer tilt. The whole stack is a link to
 * the current template's page. Reduced motion: static tilt, three still chips.
 */
export function HeroStage({ shots, className }: { shots: HeroShot[]; className?: string }) {
  const { word } = React.useContext(Ctx);
  const n = shots.length;
  const cur = shots[word % n] ?? shots[0]!;
  const rootRef = React.useRef<HTMLAnchorElement>(null);
  // previous word, tracked during render (React's "store info from previous renders" pattern) so the outgoing screen
  // stays painted under the incoming page-wipe from the very first frame
  const [track, setTrack] = React.useState({ word, prev: -1 });
  if (track.word !== word) setTrack({ word, prev: track.word });
  const prev = track.word !== word ? track.word : track.prev;
  const [mounted, setMounted] = React.useState<number[]>([0]);

  React.useEffect(() => {
    setMounted((m) => {
      const want = [word, (word + 1) % n];
      return want.every((i) => m.includes(i)) ? m : Array.from(new Set([...m, ...want]));
    });
  }, [word, n]);

  // preload the second template early so the first swap never wipes to an empty screen
  React.useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const go = () => setMounted((m) => (m.includes(1 % n) ? m : [...m, 1 % n]));
    if (idle) idle(go);
    else setTimeout(go, 600);
  }, [n]);

  // pointer tilt (fine pointer) / idle sway (touch) — writes --px/--py on the stage and --hx/--hy (light) on the hero
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const hero = el.closest("section") as HTMLElement | null;
    const fine = window.matchMedia("(pointer: fine)").matches;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    let visible = true;
    const write = () => {
      el.style.setProperty("--px", x.toFixed(4));
      el.style.setProperty("--py", y.toFixed(4));
    };
    if (fine) {
      const step = () => {
        x += (tx - x) * 0.08;
        y += (ty - y) * 0.08;
        write();
        raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(step) : 0;
      };
      const onMove = (e: PointerEvent) => {
        if (e.pointerType !== "mouse" || !visible) return;
        const r = (hero ?? el).getBoundingClientRect();
        tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
        ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
        if (hero) {
          hero.style.setProperty("--hx", `${(e.clientX - r.left).toFixed(0)}px`);
          hero.style.setProperty("--hy", `${(e.clientY - r.top).toFixed(0)}px`);
        }
        if (!raf) raf = requestAnimationFrame(step);
      };
      const io = new IntersectionObserver(([e]) => {
        visible = !!e?.isIntersecting;
      });
      io.observe(el);
      window.addEventListener("pointermove", onMove, { passive: true });
      return () => {
        io.disconnect();
        window.removeEventListener("pointermove", onMove);
        cancelAnimationFrame(raf);
      };
    }
    // touch: slow sway while on screen
    const t0 = performance.now();
    const loop = (t: number) => {
      const s = (t - t0) / 1000;
      x = Math.sin(s * 0.45) * 0.45;
      y = Math.cos(s * 0.33) * 0.3;
      write();
      raf = visible ? requestAnimationFrame(loop) : 0;
    };
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(loop);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const state = (i: number) => (i === word ? "in" : i === prev ? "out" : "wait");
  return (
    <Link
      ref={rootRef}
      href={`/templates/${cur.key}`}
      className={cn("pf-stage", className)}
      data-cursor="view"
      data-cursor-label="ดูเทมเพลต"
      aria-label={`ดูเทมเพลต ${cur.brand}`}
    >
      <span className="pf-stage__rig" aria-hidden="true">
        <span className="pf-stage__halo" />
        <span className="pf-browser">
          <span className="pf-browser__bar">
            <i />
            <i />
            <i />
            <span className="pf-browser__url">🔒 demo-{cur.key}.rentweb</span>
          </span>
          <span className="pf-browser__screen block">
            {shots.map((s, i) =>
              mounted.includes(i) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={s.key} src={s.desktop} alt="" width={1440} height={900} data-state={state(i)} loading={i === 0 ? "eager" : "lazy"} decoding="async" draggable={false} />
              ) : null,
            )}
          </span>
        </span>
        <span className="pf-phone2">
          <span className="pf-phone2__screen block">
            {shots.map((s, i) =>
              mounted.includes(i) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={s.key} src={s.mobile} alt="" width={390} height={844} data-state={state(i)} loading={i === 0 ? "eager" : "lazy"} decoding="async" draggable={false} />
              ) : null,
            )}
          </span>
        </span>
        {CHIPS.map((c, i) => (
          <span
            key={c.t}
            className="pf-chip"
            data-side={c.side}
            data-still={c.still ? "true" : "false"}
            data-m={c.mobile ? "on" : "off"}
            style={{ ...c.pos, ["--i" as string]: i, ["--z" as string]: `${c.z}px`, ["--o" as string]: c.o, ["--chip-bg" as string]: c.bg }}
          >
            <span className="pf-chip__icon">
              <ChipGlyph icon={c.icon} />
            </span>
            <span>
              <span className="pf-chip__t">{c.t}</span>
              <span className="pf-chip__d">{c.d}</span>
            </span>
            {c.icon === "trend" ? (
              <svg viewBox="0 0 48 20" className="ml-1 h-5 w-12" fill="none" aria-hidden="true">
                <defs>
                  <linearGradient id="pf-spark-g" x1="0" x2="1">
                    <stop offset="0" stopColor="#fb8464" />
                    <stop offset="1" stopColor="#ff2e7e" />
                  </linearGradient>
                </defs>
                <path d="M1 17 L9 13 L16 15 L24 8 L31 10 L39 4 L47 2" stroke="url(#pf-spark-g)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </span>
        ))}
      </span>
    </Link>
  );
}
