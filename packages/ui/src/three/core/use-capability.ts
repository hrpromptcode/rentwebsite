"use client";

import * as React from "react";
import type { CapabilityTier, Scene3dMode } from "./types";

export interface Capability {
  /** false on the server and during the first client render (always render the fallback then). */
  ready: boolean;
  webgl: boolean;
  webgl2: boolean;
  /** §2.8 tiers: low = ≤4 cores ‖ ≤4 GB ‖ saveData ‖ no WebGL ‖ reduced motion; mid = coarse pointer ‖ < 768px; else high. */
  tier: CapabilityTier;
  /** the tier ignoring reduced motion (what the GPU/CPU could do). */
  deviceTier: CapabilityTier;
  reducedMotion: boolean;
  finePointer: boolean;
  saveData: boolean;
  mobile: boolean;
  /** html[data-scene3d] (default "auto"). */
  scene3d: Scene3dMode;
}

const SSR_CAPABILITY: Capability = {
  ready: false,
  webgl: false,
  webgl2: false,
  tier: "low",
  deviceTier: "low",
  reducedMotion: false,
  finePointer: false,
  saveData: false,
  mobile: false,
  scene3d: "auto",
};

let webglCache: { webgl: boolean; webgl2: boolean } | null = null;

/** One-time WebGL probe (the probe context is released immediately). */
export function detectWebgl(): { webgl: boolean; webgl2: boolean } {
  if (webglCache) return webglCache;
  if (typeof document === "undefined") return { webgl: false, webgl2: false };
  let webgl = false;
  let webgl2 = false;
  try {
    const c = document.createElement("canvas");
    const g2 = c.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) as WebGL2RenderingContext | null;
    if (g2) {
      webgl = webgl2 = true;
      g2.getExtension("WEBGL_lose_context")?.loseContext();
    } else {
      const g1 = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
      if (g1) {
        webgl = true;
        g1.getExtension("WEBGL_lose_context")?.loseContext();
      }
    }
  } catch {
    /* no webgl */
  }
  webglCache = { webgl, webgl2 };
  return webglCache;
}

function readScene3d(): Scene3dMode {
  const v = document.documentElement.getAttribute("data-scene3d");
  return v === "lite" || v === "off" ? v : "auto";
}

export function computeCapability(): Capability {
  if (typeof window === "undefined") return SSR_CAPABILITY;
  const { webgl, webgl2 } = detectWebgl();
  const mm = (q: string) => window.matchMedia(q).matches;
  const reducedMotion = mm("(prefers-reduced-motion: reduce)");
  const finePointer = mm("(pointer: fine)");
  const coarse = mm("(pointer: coarse)");
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const saveData = !!nav.connection?.saveData;
  const cores = nav.hardwareConcurrency || 8;
  const memory = nav.deviceMemory ?? 8;
  const mobile = window.innerWidth < 768;
  const weak = cores <= 4 || memory <= 4 || saveData || !webgl;
  const deviceTier: CapabilityTier = weak ? "low" : coarse || mobile ? "mid" : "high";
  const tier: CapabilityTier = reducedMotion ? "low" : deviceTier;
  return { ready: true, webgl, webgl2, tier, deviceTier, reducedMotion, finePointer, saveData, mobile, scene3d: readScene3d() };
}

type Listener = () => void;
const listeners = new Set<Listener>();
let current: Capability = SSR_CAPABILITY;
let wired = false;

function refresh() {
  const next = computeCapability();
  const changed = (Object.keys(next) as (keyof Capability)[]).some((k) => next[k] !== current[k]);
  if (changed) {
    current = next;
    listeners.forEach((l) => l());
  }
}

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  current = computeCapability();
  const queries = ["(prefers-reduced-motion: reduce)", "(pointer: fine)", "(pointer: coarse)"];
  queries.forEach((q) => window.matchMedia(q).addEventListener("change", refresh));
  let t: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(refresh, 200);
  });
  new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ["data-scene3d"] });
}

function subscribe(l: Listener) {
  wire();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  wire();
  return current;
}

function getServerSnapshot() {
  return SSR_CAPABILITY;
}

/**
 * Device / preference capability for 3D (§2.8). SSR and the hydration render return `{ ready: false }`;
 * the real values arrive right after hydration (never touches `window` during the server render).
 */
export function useCapability(): Capability {
  const snap = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // useSyncExternalStore uses the server snapshot during hydration, then re-renders with the client value.
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);
  return hydrated ? snap : SSR_CAPABILITY;
}
