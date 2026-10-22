"use client";

import * as React from "react";

/**
 * Light mood layer (PromptCode cyan / blue / peach / pink washes): five pastel mesh blobs fixed behind every chapter (z-index −1, body is transparent). They drift
 * on slow CSS loops, lean gently toward the pointer (lerped --pf-px/--pf-py, fine pointers only) and change their hue
 * with the chapter crossing the middle of the viewport (`[data-hue]` on sections → `data-hue` here; colours are
 * registered @property values, so they crossfade). Static under reduced motion; purely decorative.
 */
export function MeshBackdrop() {
  const ref = React.useRef<HTMLDivElement>(null);

  // chapter hue
  React.useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let io: IntersectionObserver | null = null;
    const seen = new Map<Element, boolean>();
    const bind = () => {
      io?.disconnect();
      seen.clear();
      const chapters = Array.from(document.querySelectorAll<HTMLElement>("[data-hue]"));
      if (!chapters.length) {
        mesh.dataset.hue = "lilac";
        return;
      }
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) seen.set(e.target, e.isIntersecting);
          // the last chapter (document order) that crosses the centre line wins
          const active = chapters.filter((c) => seen.get(c)).pop();
          mesh.dataset.hue = active?.dataset.hue ?? "lilac";
        },
        { rootMargin: "-48% 0px -48% 0px" },
      );
      chapters.forEach((c) => io!.observe(c));
    };
    bind();
    // client navigations swap the chapters under the same layout
    const mo = new MutationObserver(() => {
      if (Array.from(document.querySelectorAll("[data-hue]")).some((c) => !seen.has(c))) bind();
    });
    const main = document.getElementById("main");
    if (main) mo.observe(main, { childList: true, subtree: false });
    return () => {
      io?.disconnect();
      mo.disconnect();
    };
  }, []);

  // pointer lean
  React.useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    const step = () => {
      x += (tx - x) * 0.05;
      y += (ty - y) * 0.05;
      mesh.style.setProperty("--pf-px", x.toFixed(3));
      mesh.style.setProperty("--pf-py", y.toFixed(3));
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(step) : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(step);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className="pf-mesh" data-hue="lilac" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
