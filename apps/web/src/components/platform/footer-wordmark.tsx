"use client";

import * as React from "react";

/**
 * The footer's closing wordmark: a giant "RentWeb" in pale porcelain — hairline ink edge (a 2px stroke under an opaque
 * fill, so the variable font's overlapping contours never show), a soft lift shadow and a slow glint — whose
 * ocean→sunrise colour is only revealed by a soft spotlight. With a fine pointer the light
 * follows the cursor anywhere over the footer (eased, rAF only while moving); on touch / coarse pointers it drifts on its
 * own (CSS keyframes on registered --pf-fx / --pf-fy); under reduced motion it rests, still. The bottom of the letters is
 * sliced by the page edge. Decorative (aria-hidden): the footer carries the brand name in text.
 */
export function FooterWordmark({ parts = ["Rent", "Web"] }: { parts?: [string, string] }) {
  const text = parts.join("");
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      el.dataset.drift = "";
      return;
    }
    const zone = el.closest("footer") ?? el;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    let started = false;
    const loop = () => {
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      if (Math.abs(tx - x) < 0.3 && Math.abs(ty - y) < 0.3) {
        x = tx;
        y = ty;
      }
      el.style.setProperty("--pf-fx", `${x.toFixed(1)}px`);
      el.style.setProperty("--pf-fy", `${y.toFixed(1)}px`);
      raf = x !== tx || y !== ty ? requestAnimationFrame(loop) : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      const r = el.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (!started) {
        // first contact: start from the resting light so it glides over instead of jumping
        started = true;
        x = r.width * 0.5;
        y = r.height * 0.52;
      }
      el.dataset.lit = "";
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onLeave = () => {
      delete el.dataset.lit;
    };
    zone.addEventListener("pointermove", onMove as EventListener, { passive: true });
    zone.addEventListener("pointerleave", onLeave);
    return () => {
      zone.removeEventListener("pointermove", onMove as EventListener);
      zone.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);
  // every layer carries the two halves so they can stack ("Rent" / "Web") on phones
  const halves = (
    <>
      <span data-half="ocean">{parts[0]}</span>
      <span data-half="sunrise">{parts[1]}</span>
    </>
  );
  return (
    <div className="pf-fwm" aria-hidden="true">
      <div ref={ref} className="pf-fwm__word" data-text={text}>
        <span className="pf-fwm__edge">{halves}</span>
        <span className="pf-fwm__glass">{halves}</span>
        {/* "Rent" in the cool ocean, "Web" in the warm sunrise — the two halves of the PromptCode mark */}
        <span className="pf-fwm__light">{halves}</span>
        <span className="pf-fwm__sheen">{halves}</span>
      </div>
    </div>
  );
}
