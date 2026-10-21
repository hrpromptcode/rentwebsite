"use client";

import * as React from "react";
import { isThemeToken, type TokenOrColor } from "./types";

/** sRGB colour resolved from CSS (0..255 channels, alpha 0..1). */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

let probeCtx: CanvasRenderingContext2D | null = null;
let probeEl: HTMLSpanElement | null = null;

function ctx2d() {
  if (probeCtx) return probeCtx;
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  probeCtx = c.getContext("2d", { willReadFrequently: true });
  return probeCtx;
}

/**
 * Resolve any CSS colour expression (token name, `var(--x)`, `oklch()`, `color-mix()`, hex …) to sRGB.
 * The value is resolved in the cascade of `scope` (default `<html>`) through a probe element (so `var()` and
 * `color-mix()` resolve), then rasterised on a 1×1 canvas so wide-gamut / oklch values become sRGB bytes.
 */
export function resolveCssColor(value: TokenOrColor, scope?: Element | null, fallback = "#808080"): Rgba {
  if (typeof document === "undefined") return { r: 128, g: 128, b: 128, a: 1 };
  const expr = isThemeToken(value) ? `var(--${value}, ${fallback})` : value;
  let computed = expr;
  try {
    const host = (scope as HTMLElement | null) ?? document.body ?? document.documentElement;
    if (!probeEl) {
      probeEl = document.createElement("span");
      probeEl.setAttribute("aria-hidden", "true");
      probeEl.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;visibility:hidden";
    }
    if (probeEl.parentNode !== host) host.appendChild(probeEl);
    probeEl.style.color = fallback;
    probeEl.style.color = expr;
    computed = getComputedStyle(probeEl).color || fallback;
  } catch {
    /* keep expr */
  }
  const ctx = ctx2d();
  if (!ctx) return hexToRgba(fallback);
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = fallback;
  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  const a = d[3]! / 255;
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  // getImageData returns premultiplied-then-unpremultiplied bytes; fine for opaque theme colours
  return { r: d[0]!, g: d[1]!, b: d[2]!, a };
}

export function hexToRgba(hex: string): Rgba {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16), a: 1 };
}

export function rgbaToHex({ r, g, b }: Rgba): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Relative luminance (WCAG) of an sRGB colour, 0..1. */
export function luminance({ r, g, b }: Rgba): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function isDarkColor(hex: string): boolean {
  return luminance(hexToRgba(hex)) < 0.25;
}

/** Read several tokens/colours as `#rrggbb`. */
export function readThemeHex<K extends string>(keys: readonly K[], scope?: Element | null): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = rgbaToHex(resolveCssColor(k, scope));
  return out;
}

/**
 * Subscribe to anything that can change theme colours: <html> class/style/data-* (dark mode, preset switch),
 * the `#tenant-theme` style element (admin live preview rewrites it), the `rw:theme` window event and
 * prefers-color-scheme. Callback is rAF-batched.
 */
export function subscribeThemeChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  let raf = 0;
  const fire = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => cb());
  };
  const html = document.documentElement;
  // Signature of everything on <html>/<body> that can carry theme colours; scroll libraries (lenis-*), cursor and
  // scene status attributes churn constantly and are ignored.
  const sigOf = (el: Element | null) => {
    if (!el) return "";
    const cls = Array.from(el.classList)
      .filter((c) => !/^(lenis|rw-scroll|is-scrolling)/.test(c))
      .join(" ");
    const data = Array.from(el.attributes)
      .filter((a) => a.name.startsWith("data-") && !/^data-(lenis|scroll|cursor|scene-status|rw-transition)/.test(a.name))
      .map((a) => `${a.name}=${a.value}`)
      .join(";");
    return `${cls}|${el.getAttribute("style") ?? ""}|${data}`;
  };
  let lastSig = sigOf(html) + "#" + sigOf(document.body);
  const mo = new MutationObserver(() => {
    const s = sigOf(html) + "#" + sigOf(document.body);
    if (s !== lastSig) {
      lastSig = s;
      fire();
    }
  });
  mo.observe(html, { attributes: true });
  if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
  let styleMo: MutationObserver | null = null;
  const watchTenantStyle = () => {
    const el = document.getElementById("tenant-theme");
    if (!el) return;
    styleMo?.disconnect();
    styleMo = new MutationObserver(fire);
    styleMo.observe(el, { childList: true, characterData: true, subtree: true });
  };
  watchTenantStyle();
  const head = new MutationObserver(() => {
    watchTenantStyle();
    fire();
  });
  head.observe(document.head, { childList: true });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", fire);
  window.addEventListener("rw:theme", fire);
  return () => {
    cancelAnimationFrame(raf);
    mo.disconnect();
    styleMo?.disconnect();
    head.disconnect();
    mq.removeEventListener("change", fire);
    window.removeEventListener("rw:theme", fire);
  };
}

/**
 * Theme colours as `#rrggbb` for 2D canvases / DOM (no three.js). Re-reads on theme change.
 * Returns `null` until mounted (SSR-safe).
 */
export function useThemeHex<K extends string>(keys: readonly K[], scopeRef?: React.RefObject<Element | null>): Record<K, string> | null {
  const sig = keys.join("|");
  const [value, setValue] = React.useState<Record<K, string> | null>(null);
  React.useEffect(() => {
    const read = () => {
      const next = readThemeHex(sig.split("|") as K[], scopeRef?.current);
      setValue((prev) => (prev && sig.split("|").every((k) => prev[k as K] === next[k as K]) ? prev : next));
    };
    read();
    return subscribeThemeChange(read);
  }, [sig, scopeRef]);
  return value;
}
