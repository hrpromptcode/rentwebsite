"use client";

import * as React from "react";
import { useCapability, type Capability } from "./use-capability";
import type { CapabilityTier, SceneQuality } from "./types";

export type SceneStatus = "idle" | "poster" | "loading" | "live" | "lost";

export interface SceneEnv {
  /** the Scene3D root element (theme colours are read in its cascade, events/scroll measured on it) */
  rootRef: React.RefObject<HTMLDivElement | null>;
  /** effective quality tier for the scene: high = full, mid = simplified (mobile, coarse pointer, quality="low") */
  quality: "high" | "mid";
  reducedMotion: boolean;
  mobile: boolean;
  finePointer: boolean;
  /** html[data-motion] multiplier (§2.1: subtle 0.5, else 1); 0 under reduced motion */
  speed: number;
  /** live flag: true while on screen and the tab is visible */
  activeRef: React.MutableRefObject<boolean>;
  capability: Capability;
}

const SceneEnvContext = React.createContext<SceneEnv | null>(null);

/** Environment of the nearest Scene3D (usable inside the r3f tree: r3f bridges context). */
export function useSceneEnv(): SceneEnv {
  const v = React.useContext(SceneEnvContext);
  if (!v) throw new Error("useSceneEnv must be used inside <Scene3D>");
  return v;
}

export function useOptionalSceneEnv(): SceneEnv | null {
  return React.useContext(SceneEnvContext);
}

export interface Scene3DProps {
  className?: string;
  style?: React.CSSProperties;
  /** static art shown on the server, until the canvas has drawn, and whenever 3D is not possible */
  fallback: React.ReactNode;
  /** mount when within this distance of the viewport (IntersectionObserver rootMargin) */
  rootMargin?: string;
  /** unmount when farther than this from the viewport */
  keepAlive?: string;
  dpr?: [number, number];
  quality?: SceneQuality;
  frameloop?: "always" | "demand";
  camera?: { fov?: number; position?: [number, number, number]; near?: number; far?: number; zoom?: number };
  orthographic?: boolean;
  /** "self": pointer events from this box; "section": from the closest <section> (overlays don't block) */
  eventSource?: "self" | "section";
  /** false = the canvas ignores pointer events entirely (scenes still read the global pointer for parallax) */
  interactive?: boolean;
  onFirstFrame?: () => void;
  onStatusChange?: (status: SceneStatus) => void;
  /** lowest device tier that gets the live scene (default "mid"; "low" devices always get the fallback) */
  minTier?: CapabilityTier;
  /** scene is cheap enough for html[data-scene3d="lite"] (shader backdrops) */
  lite?: boolean;
  /** reduced motion: render one static frame (default) or keep the poster */
  reducedMotion?: "frame" | "poster";
  /** disable tone mapping (shader scenes whose colours must match CSS exactly) */
  flat?: boolean;
  /** transparent canvas over the page (default true) */
  transparent?: boolean;
  /** DOM layer above the canvas (labels, cues) */
  overlay?: React.ReactNode;
  /** r3f children (the scene) */
  children?: React.ReactNode;
}

const CanvasHost = React.lazy(() => import("../impl/canvas-host"));

const TIER_RANK: Record<CapabilityTier, number> = { low: 0, mid: 1, high: 2 };

const ric: (cb: () => void) => () => void = (cb) => {
  if (typeof window === "undefined") return () => {};
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(cb, { timeout: 1200 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = setTimeout(cb, 120);
  return () => clearTimeout(id);
};

function readSpeed(): number {
  if (typeof document === "undefined") return 1;
  const m = document.documentElement.getAttribute("data-motion");
  return m === "subtle" ? 0.5 : 1;
}

/**
 * Lazy, resilient WebGL host (§3.1). Renders `fallback` on the server and until the first frame; mounts the r3f
 * <Canvas> only when near the viewport and the device qualifies; pauses when off-screen / tab hidden; unmounts when
 * far away; falls back on context loss or sustained low FPS; one static frame under reduced motion.
 * The root box must be sized by the parent / className (no layout shift).
 */
export function Scene3D({
  className,
  style,
  fallback,
  rootMargin = "200px",
  keepAlive = "150%",
  dpr = [1, 1.75],
  quality = "auto",
  frameloop = "always",
  camera,
  orthographic,
  eventSource = "self",
  interactive = true,
  onFirstFrame,
  onStatusChange,
  minTier = "mid",
  lite = false,
  reducedMotion: reducedMode = "frame",
  flat = false,
  transparent = true,
  overlay,
  children,
}: Scene3DProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cap = useCapability();
  const [near, setNear] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [onScreen, setOnScreen] = React.useState(false);
  const [docHidden, setDocHidden] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [live, setLive] = React.useState(false);
  const activeRef = React.useRef(false);

  const allowed =
    cap.ready &&
    cap.webgl &&
    !failed &&
    cap.scene3d !== "off" &&
    (cap.scene3d !== "lite" || lite) &&
    (quality === "high" || TIER_RANK[cap.deviceTier] >= TIER_RANK[minTier]) &&
    !(cap.reducedMotion && reducedMode === "poster");

  // near / keep-alive / on-screen observers
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el || !allowed) return;
    const ioNear = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), { rootMargin });
    const ioKeep = new IntersectionObserver(([e]) => !e?.isIntersecting && setNear(false), { rootMargin: keepAlive });
    const ioVis = new IntersectionObserver(([e]) => setOnScreen(!!e?.isIntersecting), { rootMargin: "0px" });
    ioNear.observe(el);
    ioKeep.observe(el);
    ioVis.observe(el);
    return () => {
      ioNear.disconnect();
      ioKeep.disconnect();
      ioVis.disconnect();
    };
  }, [allowed, rootMargin, keepAlive]);

  // mount after idle when near; unmount when far
  React.useEffect(() => {
    if (!allowed || !near) {
      setMounted(false);
      setLive(false);
      return;
    }
    return ric(() => setMounted(true));
  }, [allowed, near]);

  React.useEffect(() => {
    const onVis = () => setDocHidden(document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const active = mounted && onScreen && !docHidden;
  activeRef.current = active;

  const status: SceneStatus = !cap.ready ? "idle" : failed ? "lost" : !allowed ? "poster" : live ? "live" : mounted ? "loading" : "poster";
  const statusCb = React.useRef(onStatusChange);
  statusCb.current = onStatusChange;
  React.useEffect(() => statusCb.current?.(status), [status]);

  const [speed, setSpeed] = React.useState(1);
  React.useEffect(() => {
    setSpeed(readSpeed());
    const mo = new MutationObserver(() => setSpeed(readSpeed()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    return () => mo.disconnect();
  }, []);

  const env = React.useMemo<SceneEnv>(
    () => ({
      rootRef,
      quality: quality === "high" ? "high" : quality === "low" ? "mid" : cap.deviceTier === "high" ? "high" : "mid",
      reducedMotion: cap.reducedMotion,
      mobile: cap.mobile,
      finePointer: cap.finePointer,
      speed: cap.reducedMotion ? 0 : speed,
      activeRef,
      capability: cap,
    }),
    [quality, cap, speed],
  );

  const effDpr: [number, number] = env.quality === "high" ? dpr : [Math.min(dpr[0], 1), Math.min(dpr[1], 1.25)];
  const loop = !active ? "never" : cap.reducedMotion ? "demand" : frameloop;

  const firstFrameCb = React.useRef(onFirstFrame);
  firstFrameCb.current = onFirstFrame;
  const handleFirstFrame = React.useCallback(() => {
    setLive(true);
    firstFrameCb.current?.();
  }, []);
  const handleLost = React.useCallback(() => {
    setFailed(true);
    setLive(false);
    setMounted(false);
  }, []);

  const positioned = style?.position || /(^|\s)(absolute|fixed|sticky|relative)(\s|$)/.test(className ?? "");

  return (
    <SceneEnvContext.Provider value={env}>
      <div
        ref={rootRef}
        className={className}
        data-scene-status={status}
        style={{ ...(positioned ? null : { position: "relative" }), ...style }}
      >
        <div
          aria-hidden={live ? true : undefined}
          style={{
            position: "absolute",
            inset: 0,
            opacity: live ? 0 : 1,
            visibility: live ? "hidden" : "visible",
            transition: live ? "opacity 600ms cubic-bezier(0.16,1,0.3,1), visibility 0s linear 600ms" : "none",
          }}
        >
          {fallback}
        </div>
        {mounted ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              opacity: live ? 1 : 0,
              transition: "opacity 600ms cubic-bezier(0.16,1,0.3,1)",
              pointerEvents: interactive ? undefined : "none",
            }}
          >
            <React.Suspense fallback={null}>
              <CanvasHost
                rootRef={rootRef}
                dpr={effDpr}
                frameloop={loop}
                camera={camera}
                orthographic={orthographic}
                eventSource={interactive ? eventSource : "none"}
                flat={flat}
                transparent={transparent}
                antialias={env.quality === "high"}
                watchdog={!cap.reducedMotion}
                onFirstFrame={handleFirstFrame}
                onLost={handleLost}
              >
                {children}
              </CanvasHost>
            </React.Suspense>
          </div>
        ) : null}
        {overlay}
      </div>
    </SceneEnvContext.Provider>
  );
}
