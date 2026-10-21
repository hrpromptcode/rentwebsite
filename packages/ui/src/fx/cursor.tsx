"use client";

import * as React from "react";

export type CursorMode = "off" | "dot" | "label";
export type CursorKind = "default" | "link" | "view" | "drag" | "play" | "text" | "hide";

const DEFAULT_LABELS: Partial<Record<CursorKind, string>> = { view: "ดู", drag: "ลาก", play: "เล่น" };
const FORM = "input, textarea, select, option, [contenteditable=''], [contenteditable='true'], form, [role='combobox'], [role='listbox']";
const INTERACTIVE = "a[href], button, [role='button'], [role='tab'], label, summary, [data-cursor-hover]";

interface CursorApi {
  /** force a cursor state (e.g. from a canvas hover); null clears it */
  set: (state: { kind: CursorKind; label?: string } | null) => void;
}
const CursorContext = React.createContext<CursorApi>({ set: () => {} });

/** Imperative cursor state for components (3D canvases …). Also available as `window.dispatchEvent(new CustomEvent("rw:cursor", { detail: { kind, label } | null }))`. */
export function useCursor(): CursorApi {
  return React.useContext(CursorContext);
}

/**
 * Mounts the custom cursor for the page (theme effects.cursor) and provides `useCursor()`. Renders `children` as is.
 */
export function CursorProvider({ mode = "dot", blend = false, children }: { mode?: CursorMode; blend?: boolean; children?: React.ReactNode }) {
  const api = React.useMemo<CursorApi>(
    () => ({ set: (state) => window.dispatchEvent(new CustomEvent("rw:cursor", { detail: state })) }),
    [],
  );
  return (
    <CursorContext.Provider value={api}>
      {children}
      {mode !== "off" ? <Cursor mode={mode} blend={blend} /> : null}
    </CursorContext.Provider>
  );
}

/**
 * Dot (8px) + lerped ring (36px) cursor (§3.2). Hover targets opt in with `data-cursor="view|drag|play|link|text|hide"`
 * and `data-cursor-label="…"`; links / buttons grow the ring. The native cursor is hidden ONLY inside `[data-cursor]`
 * zones and never over form fields (inputs, textareas, selects, contenteditable, forms) — there the custom cursor
 * hides itself. Fine pointers + motion allowed + marketing routes only (html[data-route="operational"] turns it off).
 * mode "dot" = states without text labels; "label" = dot + contextual labels.
 */
export function Cursor({ mode = "dot", blend = false }: { mode?: CursorMode; blend?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [on, setOn] = React.useState(false);

  React.useEffect(() => {
    if (mode === "off") return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const html = document.documentElement;
    const evaluate = () => setOn(fine.matches && !reduce.matches && html.dataset.route !== "operational");
    evaluate();
    fine.addEventListener("change", evaluate);
    reduce.addEventListener("change", evaluate);
    const mo = new MutationObserver(evaluate);
    mo.observe(html, { attributes: true, attributeFilter: ["data-route"] });
    return () => {
      fine.removeEventListener("change", evaluate);
      reduce.removeEventListener("change", evaluate);
      mo.disconnect();
    };
  }, [mode]);

  React.useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const html = document.documentElement;
    html.setAttribute("data-cursor-active", "");
    const dot = el.querySelector<HTMLElement>("[data-cursor-dot]")!;
    const ring = el.querySelector<HTMLElement>("[data-cursor-ring]")!;
    const text = el.querySelector<HTMLElement>("[data-cursor-text]")!;
    let tx = -100;
    let ty = -100;
    let rx = -100;
    let ry = -100;
    let dx = -100;
    let dy = -100;
    let raf = 0;
    let forced: { kind: CursorKind; label?: string } | null = null;
    let lastTarget: Element | null = null;

    const apply = (kind: CursorKind, label?: string) => {
      el.dataset.kind = kind;
      const lbl = mode === "label" ? (label ?? DEFAULT_LABELS[kind] ?? "") : "";
      el.dataset.hasLabel = lbl ? "true" : "false";
      if (text.dataset.pt !== lbl) text.dataset.pt = lbl; // generated content: no DOM text for getByText
    };
    const resolve = (target: Element | null) => {
      if (forced) return apply(forced.kind, forced.label);
      if (!target || !(target instanceof Element)) return apply("default");
      if (target.closest(FORM)) return apply("hide");
      const zone = target.closest("[data-cursor]");
      if (zone && zone !== html && zone !== document.body) {
        const k = (zone.getAttribute("data-cursor") || "view") as CursorKind;
        const kind: CursorKind = ["link", "view", "drag", "play", "text", "hide"].includes(k) ? k : "view";
        return apply(kind, zone.getAttribute("data-cursor-label") ?? undefined);
      }
      if (target.closest(INTERACTIVE)) return apply("link");
      apply("default");
    };
    const loop = () => {
      dx += (tx - dx) * 0.55;
      dy += (ty - dy) * 0.55;
      rx += (tx - rx) * 0.17;
      ry += (ty - ry) * 0.17;
      dot.style.transform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0)`;
      ring.style.transform = `translate3d(${rx.toFixed(1)}px,${ry.toFixed(1)}px,0)`;
      raf = Math.abs(tx - rx) + Math.abs(ty - ry) > 0.2 ? requestAnimationFrame(loop) : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      if (el.dataset.visible !== "true") {
        el.dataset.visible = "true";
        rx = dx = tx;
        ry = dy = ty;
      }
      if (e.target !== lastTarget) {
        lastTarget = e.target as Element;
        resolve(lastTarget);
      }
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onLeaveDoc = (e: PointerEvent) => {
      if (!e.relatedTarget) el.dataset.visible = "false";
    };
    const onDown = () => (el.dataset.pressed = "true");
    const onUp = () => (el.dataset.pressed = "false");
    const onForce = (e: Event) => {
      forced = ((e as CustomEvent).detail as typeof forced) ?? null;
      resolve(lastTarget);
    };
    // re-resolve after scrolling (the element under a resting pointer changes)
    const onScroll = () => {
      if (el.dataset.visible !== "true") return;
      const t = document.elementFromPoint(tx, ty);
      if (t !== lastTarget) {
        lastTarget = t;
        resolve(t);
      }
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onLeaveDoc);
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("rw:cursor", onForce);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      html.removeAttribute("data-cursor-active");
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onLeaveDoc);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("rw:cursor", onForce);
      window.removeEventListener("scroll", onScroll);
    };
  }, [on, mode]);

  if (!on) return null;
  return (
    <div ref={ref} className="rw-cursor" data-rw-cursor="" data-kind="default" data-visible="false" data-blend={blend ? "" : undefined} aria-hidden="true">
      <div data-cursor-ring="">
        <span data-cursor-shape="">
          <span data-cursor-text="" />
        </span>
      </div>
      <div data-cursor-dot="">
        <span />
      </div>
    </div>
  );
}
