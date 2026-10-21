"use client";

import * as React from "react";
import { Scene3D, type SceneStatus } from "./core/scene-3d";
import { ScenePoster } from "./core/poster";
import { KitStyles } from "./core/kit-styles";

export interface CurvedGalleryItem {
  image: string;
  title: string;
  subtitle?: string;
  href?: string;
  tag?: string;
}

export interface CurvedGalleryProps {
  items: CurvedGalleryItem[];
  /** cylinder radius (world units) */
  radius?: number;
  /** fraction of π: cards farther than arc·π/2 from the front fade out */
  arc?: number;
  /** card width / height */
  cardAspect?: number;
  rows?: 1 | 2;
  /** extra vertical bow of each card (0 = flat cylinder slice) */
  bend?: number;
  /** idle spin in rad/s (0 = off; then the ring snaps to cards) */
  autoplay?: number;
  drag?: boolean;
  /** page scroll velocity spins the ring */
  scrollLinked?: boolean;
  floor?: "grid" | "reflect" | "none";
  fog?: boolean;
  height?: "screen" | "tall" | "compact";
  /** DOM label (title + subtitle) pinned under the hovered / focused card */
  labels?: "dom" | "none";
  cursorLabel?: string;
  openLabel?: string;
  /** accessible name of the list of links */
  ariaLabel?: string;
  className?: string;
}

/** Shared mutable channel between the DOM wrapper and the WebGL scene (no React state per frame). */
export interface GalleryBridge {
  focus: number | null;
  labelEl: HTMLDivElement | null;
  setLabel: (itemIndex: number | null, focus?: boolean) => void;
  open: (itemIndex: number) => void;
  setHovering: (on: boolean) => void;
  setDragging: (on: boolean) => void;
}

const Impl = React.lazy(() => import("./impl/curved-gallery-scene"));

/** Initial transform of a CSS-strip card at offset `o` (in cards) from the centre — SSR + client agree. */
function stripVars(o: number): React.CSSProperties {
  const c = Math.max(-3, Math.min(3, o));
  return { ["--ry" as string]: `${(-c * 24).toFixed(2)}deg`, ["--tz" as string]: `${(Math.abs(c) * 46).toFixed(1)}px`, ["--sc" as string]: `${(1 - Math.min(Math.abs(c), 2) * 0.03).toFixed(3)}` };
}

/**
 * Vyre-style 3D gallery: cards bent on a cylinder around the camera above a perspective grid floor.
 * Drag (inertia + snap), scroll velocity and idle autoplay rotate the ring; hover lifts a card; click opens its link.
 * The SSR markup is a real <ul> of links: a CSS 3D strip (fallback / reduced motion / low tier) or, once the canvas
 * is live, a visually-hidden mirror whose focus rotates the ring.
 */
export function CurvedGallery(props: CurvedGalleryProps) {
  const { items, height = "screen", cursorLabel = "ลาก", openLabel = "เปิดดู", labels = "dom", floor = "grid", className, cardAspect = 0.8, ariaLabel } = props;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const labelRef = React.useRef<HTMLDivElement>(null);
  const [status, setStatus] = React.useState<SceneStatus>("idle");
  const live = status === "live";

  const bridge = React.useRef<GalleryBridge>(null as unknown as GalleryBridge);
  if (!bridge.current) {
    bridge.current = {
      focus: null,
      labelEl: null,
      setLabel(i, focus) {
        const el = labelRef.current;
        if (!el) return;
        if (i === null || labels === "none") {
          el.dataset.visible = "false";
          return;
        }
        const it = itemsRef.current[i];
        if (!it) return;
        const set = (k: string, v: string) => {
          const n = el.querySelector(`[data-k="${k}"]`);
          if (n && n.textContent !== v) n.textContent = v;
        };
        set("tag", it.tag ?? "");
        set("title", it.title);
        set("subtitle", it.subtitle ?? "");
        el.dataset.visible = "true";
        el.dataset.focus = focus ? "true" : "false";
      },
      open(i) {
        const a = listRef.current?.querySelector<HTMLAnchorElement>(`a[data-gallery-index="${i}"]`);
        a?.click();
      },
      setHovering(on) {
        const r = rootRef.current;
        if (!r) return;
        r.dataset.hovering = on ? "true" : "false";
        r.dataset.cursor = on ? "view" : "drag";
        r.dataset.cursorLabel = on ? openLabel : cursorLabel;
      },
      setDragging(on) {
        if (rootRef.current) rootRef.current.dataset.dragging = on ? "true" : "false";
      },
    };
  }
  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  React.useEffect(() => {
    bridge.current.labelEl = labelRef.current;
  });

  // CSS strip: rotate cards by their offset from the centre while scrolling (fallback mode only)
  React.useEffect(() => {
    const ul = listRef.current;
    if (!ul || live) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const cx = ul.scrollLeft + ul.clientWidth / 2;
      const lis = ul.children;
      for (let i = 0; i < lis.length; i++) {
        const li = lis[i] as HTMLElement;
        const w = li.offsetWidth || 1;
        const o = (li.offsetLeft + w / 2 - cx) / (w * 1.08);
        const v = stripVars(o);
        for (const [k, val] of Object.entries(v)) li.style.setProperty(k, String(val));
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    ul.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // mouse drag-to-scroll (fine pointers); touch scrolls natively
    let down = false;
    let sx = 0;
    let sl = 0;
    let moved = false;
    const pd = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      down = true;
      moved = false;
      sx = e.clientX;
      sl = ul.scrollLeft;
      ul.style.scrollSnapType = "none";
    };
    const pm = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 4) moved = true;
      ul.scrollLeft = sl - dx;
    };
    const pu = () => {
      if (!down) return;
      down = false;
      ul.style.scrollSnapType = "";
    };
    const clickGuard = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    };
    ul.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    ul.addEventListener("click", clickGuard, true);
    return () => {
      cancelAnimationFrame(raf);
      ul.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ul.removeEventListener("pointerdown", pd);
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
      ul.removeEventListener("click", clickGuard, true);
    };
  }, [live, items.length]);

  if (!items.length) return null;

  return (
    <div
      ref={rootRef}
      className={["rw3d-gallery", className].filter(Boolean).join(" ")}
      data-height={height}
      data-cursor="drag"
      data-cursor-label={cursorLabel}
      data-live={live ? "true" : "false"}
    >
      <KitStyles />
      <Scene3D
        className="absolute inset-0"
        fallback={<ScenePoster variant={floor === "none" ? "plain" : "grid"} />}
        reducedMotion="poster"
        minTier="mid"
        eventSource="self"
        camera={{ fov: 52, position: [0, 0, 0], near: 0.1, far: 120 }}
        onStatusChange={setStatus}
      >
        <Impl {...props} bridge={bridge.current} />
      </Scene3D>
      <ul
        ref={listRef}
        className="rw3d-strip"
        data-mode={live ? "mirror" : "strip"}
        aria-label={ariaLabel}
        style={{ ["--rw3d-aspect" as string]: String(cardAspect) }}
      >
        {items.map((it, i) => {
          const body = (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.image} alt="" loading={i < 3 ? "eager" : "lazy"} decoding="async" draggable={false} />
              {it.tag ? <span className="rw3d-tag">{it.tag}</span> : null}
              <span className="rw3d-cap">
                <strong>{it.title}</strong>
                {it.subtitle ? <span>{it.subtitle}</span> : null}
              </span>
            </>
          );
          return (
            <li key={`${it.title}-${i}`} style={stripVars(i)}>
              {it.href ? (
                <a
                  href={it.href}
                  data-gallery-index={i}
                  draggable={false}
                  onFocus={() => {
                    bridge.current.focus = i;
                  }}
                  onBlur={() => {
                    if (bridge.current.focus === i) bridge.current.focus = null;
                  }}
                >
                  {body}
                </a>
              ) : (
                <div className="rw3d-card">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {labels === "dom" ? (
        <div ref={labelRef} className="rw3d-gallery-label" aria-hidden data-visible="false">
          <span data-k="tag" />
          <strong data-k="title" />
          <span data-k="subtitle" />
        </div>
      ) : null}
    </div>
  );
}
