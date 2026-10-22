"use client";

import * as React from "react";
import { requestScrollTick, useScrollEffect } from "@rentweb/ui/motion";
import { mulberry32 } from "@rentweb/ui/motion/random";

export interface JourneyStep {
  kicker: string;
  title: string;
  body: string;
  /** two screenshots that fly past while this step is active */
  shots: string[];
}

const RINGS = 12;
const RING_GAP = 430;
const RING_SPAN = RINGS * RING_GAP;
const RING_COLORS = ["#1561b7", "#ff2e7e", "#0ec0dc", "#fb8464", "#1e8fd8", "#ff5470"];
const SPARK_COLORS = ["#1561b7", "#ff2e7e", "#fb8464", "#0ec0dc", "#1e8fd8", "#ff5470", "#ff9f5a"];
/** pastel confetti streaming through the tunnel (deterministic) */
const SPARKS = (() => {
  const r = mulberry32(5150);
  return Array.from({ length: 30 }, (_, i) => {
    const a = r() * Math.PI * 2;
    const d = 0.35 + r() * 0.65;
    return { x: Math.cos(a) * d * 46, y: Math.sin(a) * d * 40, phase: r(), size: 5 + Math.round(r() * 9), c: SPARK_COLORS[i % SPARK_COLORS.length]! };
  });
})();
/** where each step's two cards sit in the tunnel cross-section (vw / vh from the centre) */
const CARD_POS: [number, number][] = [
  [-36, -18],
  [35, 15],
  [35, -20],
  [-36, 16],
  [-37, 14],
  [36, -17],
  [35, 18],
  [-35, -19],
  [-35, -15],
  [37, 17],
];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * "From idea to open" — a LIGHT tunnel built in CSS 3D: wireframe rings in the PromptCode ocean + sunrise colours stream toward
 * the camera as you scroll, the template screenshots of each step fly past on both sides on white glass cards, and the
 * active step crossfades in a glass card in the bright centre (number in sunrise gradient, kicker, title, body).
 * Sticky 100svh stage inside a (steps × 70svh + 100svh) section; transforms only, batched with the kit scroll loop.
 * Reduced motion / before hydration: a numbered list of glass cards. The list is always the accessible content.
 */
export function LaunchJourney({ steps, ariaLabel }: { steps: JourneyStep[]; ariaLabel: string }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const ringRefs = React.useRef<(HTMLElement | null)[]>([]);
  const cardRefs = React.useRef<(HTMLElement | null)[]>([]);
  const tickRefs = React.useRef<(HTMLElement | null)[]>([]);
  const sparkRefs = React.useRef<(HTMLElement | null)[]>([]);
  const progress = React.useRef(0);
  const [live, setLive] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const activeRef = React.useRef(0);
  const n = steps.length;

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setLive(true);
  }, []);
  React.useEffect(() => {
    if (live) requestScrollTick();
  }, [live]);

  useScrollEffect(
    rootRef,
    {
      read: () => {
        const el = rootRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const total = r.height - vh;
        progress.current = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
      },
      write: () => {
        const p = progress.current;
        const vw = window.innerWidth / 100;
        const vh = window.innerHeight / 100;
        // rings stream toward the camera
        for (let i = 0; i < RINGS; i++) {
          const el = ringRefs.current[i];
          if (!el) continue;
          let z = (i * RING_GAP + p * RING_SPAN * 1.6) % RING_SPAN;
          z = z - RING_SPAN + 700;
          const o = smooth(-RING_SPAN + 700, -RING_SPAN + 2200, z) * (1 - smooth(150, 650, z));
          el.style.transform = `translate(-50%, -50%) translateZ(${z.toFixed(0)}px) rotate(${(p * 120 + i * 17).toFixed(1)}deg)`;
          el.style.opacity = (o * 0.85).toFixed(3);
        }
        // confetti
        for (let k = 0; k < SPARKS.length; k++) {
          const el = sparkRefs.current[k];
          const sp = SPARKS[k]!;
          if (!el) continue;
          const z = ((sp.phase + p * 2.4) % 1) * 4200 - 3600;
          const o = smooth(-3600, -2600, z) * (1 - smooth(200, 600, z));
          el.style.transform = `translate3d(calc(-50% + ${(sp.x * vw).toFixed(0)}px), calc(-50% + ${(sp.y * vh).toFixed(0)}px), ${z.toFixed(0)}px)`;
          el.style.opacity = o.toFixed(3);
        }
        // cards fly past around their step
        const s = p * n;
        for (let k = 0; k < cardRefs.current.length; k++) {
          const el = cardRefs.current[k];
          if (!el) continue;
          const step = Math.floor(k / 2);
          const local = s - (step + 0.5) + (k % 2 ? -0.12 : 0.12);
          const z = local * 2300;
          const [x, y] = CARD_POS[k % CARD_POS.length]!;
          const o = smooth(-2600, -1700, z) * (1 - smooth(260, 760, z));
          el.style.transform = `translate3d(calc(-50% + ${(x * vw).toFixed(0)}px), calc(-50% + ${(y * vh).toFixed(0)}px), ${z.toFixed(0)}px) rotateY(${(x > 0 ? -1 : 1) * 14}deg)`;
          el.style.opacity = o.toFixed(3);
          el.style.visibility = o < 0.01 ? "hidden" : "visible";
        }
        // progress ticks + active step
        for (let i = 0; i < n; i++) tickRefs.current[i]?.style.setProperty("--f", Math.min(1, Math.max(0, s - i)).toFixed(3));
        const a = Math.min(n - 1, Math.max(0, Math.floor(s)));
        if (a !== activeRef.current) {
          activeRef.current = a;
          setActive(a);
        }
      },
    },
    { enabled: live, margin: "10% 0px" },
  );

  return (
    <div
      ref={rootRef}
      className="pf-journey"
      data-mode={live ? "live" : "static"}
      style={{ height: live ? `${n * 70 + 100}svh` : undefined }}
    >
      {live ? (
        <div className="pf-journey__stage" aria-hidden="true">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(38%_42%_at_50%_46%,rgb(255_255_255/0.95),rgb(255_255_255/0.55)_45%,transparent_80%)]" />
          <div className="pf-journey__rings">
            {Array.from({ length: RINGS }, (_, i) => (
              <i
                key={i}
                ref={(el) => {
                  ringRefs.current[i] = el;
                }}
                style={{ borderColor: `${RING_COLORS[i % RING_COLORS.length]}b3`, borderStyle: i % 3 === 2 ? "dashed" : "solid", opacity: 0 }}
              />
            ))}
            {SPARKS.map((sp, i) => (
              <b
                key={`s${i}`}
                ref={(el) => {
                  sparkRefs.current[i] = el;
                }}
                className="pf-journey__spark"
                style={{ width: sp.size, height: sp.size, background: sp.c, boxShadow: `0 0 ${sp.size * 2}px ${sp.c}`, opacity: 0 }}
              />
            ))}
            {steps.flatMap((st, si) =>
              st.shots.slice(0, 2).map((src, j) => (
                <span
                  key={`${si}-${j}`}
                  ref={(el) => {
                    cardRefs.current[si * 2 + j] = el;
                  }}
                  className="pf-journey__shot"
                  style={{ left: "50%", top: "46%", opacity: 0, visibility: "hidden" }}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" loading="lazy" decoding="async" draggable={false} />
                  ) : null}
                </span>
              )),
            )}
          </div>
          <div className="pf-journey__copy">
            {steps.map((st, i) => (
              <div key={st.title} className="pf-journey__step" data-active={i === active ? "true" : "false"}>
                <p className="pf-journey__num">
                  <span className="pf-grad-text">{String(i + 1).padStart(2, "0")}</span>
                </p>
                <div className="pf-journey__glass">
                  <p className="mono-label text-primary" data-script="latin">
                    {`${String(i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")} · ${st.kicker}`}
                  </p>
                  <p className="display-thai mt-3 text-[clamp(1.9rem,1.3rem+2.6vw,3.9rem)] font-semibold leading-[1.2]">{st.title}</p>
                  <p className="mx-auto mt-3 max-w-[40ch] text-step-1 leading-[1.7] text-muted-foreground">{st.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="pf-journey__progress">
            {steps.map((st, i) => (
              <b
                key={st.title}
                ref={(el) => {
                  tickRefs.current[i] = el;
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
      <ol aria-label={ariaLabel} className={live ? "sr-only" : "pf-journey__list mt-12 grid gap-4 px-[var(--gutter)] pb-[var(--section-y)] sm:grid-cols-2 lg:grid-cols-5"}>
        {steps.map((st, i) => (
          <li key={st.title} className="pf-glass relative rounded-[28px] p-6 shadow-[0_40px_80px_-56px_rgb(21_97_183/0.6)]">
            <span className="pf-grad-text block font-accent text-[3.2rem] font-semibold leading-[1] tracking-[-0.04em]" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="mono-label mt-3 block text-primary" data-script="latin">
              {st.kicker}
            </span>
            <h3 className="mt-1 text-step-2 font-semibold leading-[1.35]">{st.title}</h3>
            <p className="mt-2 leading-[1.7] text-muted-foreground">{st.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
