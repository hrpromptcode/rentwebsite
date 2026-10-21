"use client";

import * as React from "react";
import type { Script } from "./split";

export function PreloaderClient({
  brand,
  parts,
  script,
  logoUrl,
  variant,
  minMs,
  maxMs,
  onceKey,
}: {
  brand: string;
  parts: string[];
  script: Script;
  logoUrl?: string;
  variant: "counter" | "wordmark" | "curtain";
  minMs: number;
  maxMs: number;
  onceKey: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const countRef = React.useRef<HTMLSpanElement>(null);
  const [gone, setGone] = React.useState(false);

  React.useEffect(() => {
    const html = document.documentElement;
    const el = ref.current;
    const w = window as Window & { __rwPreloader?: string };
    if (w.__rwPreloader !== "on" || !el) {
      setGone(true);
      return;
    }
    html.dataset.preloader = "on"; // post-hydration: a CSS hook for pages that want to hold their hero
    const css = document.getElementById("rw-preloader-css");
    const exitMs = Math.min(520, Math.max(320, maxMs * 0.4));
    const t0 = performance.now();
    let raf = 0;
    let finished = false;
    let loaded = document.readyState === "complete";
    const onLoad = () => (loaded = true);
    window.addEventListener("load", onLoad, { once: true });
    // block wheel / touch scrolling underneath while the overlay is up (no overflow toggling: no scrollbar shift)
    const block = (e: Event) => e.cancelable && e.preventDefault();
    window.addEventListener("wheel", block, { passive: false });
    window.addEventListener("touchmove", block, { passive: false });
    const unblock = () => {
      window.removeEventListener("wheel", block);
      window.removeEventListener("touchmove", block);
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      unblock();
      try {
        sessionStorage.setItem(onceKey, "1");
      } catch {
        /* ignore */
      }
      w.__rwPreloader = "done";
      css?.remove();
      html.removeAttribute("data-preloader");
      html.setAttribute("data-preloaded", "");
      window.dispatchEvent(new Event("rw:preloaded"));
      setGone(true);
    };

    const exit = () => {
      el.dataset.state = "exit";
      el.style.setProperty("--pl-exit", `${exitMs}ms`);
      // hand off to the hero intro a little before the curtain is fully up
      setTimeout(() => {
        w.__rwPreloader = "exit";
        html.setAttribute("data-preloaded", "");
        window.dispatchEvent(new Event("rw:preloaded"));
      }, exitMs * 0.45);
      setTimeout(finish, exitMs + 40);
    };

    el.dataset.state = "run";
    // The counter runs from the first RENDERED frame (a busy main thread during hydration must not eat the whole show):
    // ≥ 380ms of visible counting, ending ~260ms after window load, and by maxMs overall whenever the device allows.
    let start = 0;
    let end = 0;
    let earliest = 0;
    let latest = 0;
    let endFixed = false;
    const tick = (t: number) => {
      if (!start) {
        start = t;
        const used = t - t0;
        earliest = Math.max(380, minMs - used);
        latest = Math.max(earliest, maxMs - exitMs - used);
        end = latest;
      }
      const elapsed = t - start;
      if (loaded && !endFixed) {
        endFixed = true;
        end = Math.max(earliest, Math.min(latest, elapsed + 260));
      }
      const k = Math.min(1, elapsed / end);
      const v = Math.round(100 * (1 - Math.pow(1 - k, 3)));
      if (countRef.current) countRef.current.textContent = String(v).padStart(3, "0");
      el.style.setProperty("--pl-p", (v / 100).toFixed(3));
      if (k >= 1) {
        exit();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const hardCap = setTimeout(finish, maxMs + 450);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hardCap);
      window.removeEventListener("load", onLoad);
      unblock();
    };
  }, [minMs, maxMs, onceKey]);

  if (gone) return null;
  return (
    <div ref={ref} className="rw-preloader" data-rw-preloader="" data-variant={variant} data-state="idle" aria-hidden="true">
      <div data-pl-inner="">
        {variant === "wordmark" && logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img data-pl-logo="" src={logoUrl} alt="" />
        ) : variant !== "curtain" ? (
          <p data-pl-brand="" data-script={script}>
            {parts.map((g, i) =>
              /^\s+$/.test(g) ? (
                <span key={i} data-pl-space="" />
              ) : (
                <span key={i} data-pl-mask="">
                  <span data-pl-g="" data-pt={g} style={{ "--i": i } as React.CSSProperties} />
                </span>
              ),
            )}
          </p>
        ) : null}
        <span data-pl-meta="">
          <span data-pl-label="" data-pt={brand.length > 24 ? "" : brand} />
          <span ref={countRef} data-pl-count="">
            000
          </span>
        </span>
        <span data-pl-bar="" />
      </div>
    </div>
  );
}
