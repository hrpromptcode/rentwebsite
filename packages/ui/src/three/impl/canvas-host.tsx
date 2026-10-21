"use client";

import * as React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";

export interface CanvasHostProps {
  rootRef: React.RefObject<HTMLDivElement | null>;
  dpr: [number, number];
  frameloop: "always" | "demand" | "never";
  camera?: { fov?: number; position?: [number, number, number]; near?: number; far?: number; zoom?: number };
  orthographic?: boolean;
  eventSource: "self" | "section" | "none";
  flat: boolean;
  transparent: boolean;
  antialias: boolean;
  watchdog: boolean;
  onFirstFrame: () => void;
  onLost: () => void;
  children?: React.ReactNode;
}

function FrameWatch({ onFirstFrame, onSlow, watchdog, atMinDpr }: { onFirstFrame: () => void; onSlow: () => void; watchdog: boolean; atMinDpr: React.MutableRefObject<boolean> }) {
  const frames = React.useRef(0);
  const fired = React.useRef(false);
  const win = React.useRef({ t0: 0, n: 0, slow: 0 });
  const invalidate = useThree((s) => s.invalidate);
  const frameloop = useThree((s) => s.frameloop);
  React.useEffect(() => {
    // demand mode (reduced motion): make sure a second frame happens after late uniforms/textures settle
    if (frameloop === "demand") {
      const t = setTimeout(() => invalidate(), 300);
      return () => clearTimeout(t);
    }
  }, [frameloop, invalidate]);
  useFrame(() => {
    frames.current++;
    if (!fired.current && (frames.current >= 2 || frameloop === "demand")) {
      fired.current = true;
      // let the browser present the frame before fading the canvas in
      requestAnimationFrame(() => onFirstFrame());
    }
    if (!watchdog || frameloop !== "always") return;
    const now = performance.now();
    const w = win.current;
    if (!w.t0) {
      w.t0 = now;
      w.n = 0;
      return;
    }
    w.n++;
    const el = now - w.t0;
    if (el >= 1000) {
      const fps = (w.n * 1000) / el;
      // ignore windows that include a long pause (tab switch / frameloop resumed)
      if (el < 2500) {
        if (fps < 30 && atMinDpr.current) w.slow++;
        else w.slow = 0;
        if (w.slow >= 3 && !document.documentElement.hasAttribute("data-scene3d-force")) onSlow();
      }
      w.t0 = now;
      w.n = 0;
    }
  });
  return null;
}

function ContextLossGuard({ onLost }: { onLost: () => void }) {
  const gl = useThree((s) => s.gl);
  React.useEffect(() => {
    const el = gl.domElement;
    const h = (e: Event) => {
      e.preventDefault();
      onLost();
    };
    el.addEventListener("webglcontextlost", h);
    return () => el.removeEventListener("webglcontextlost", h);
  }, [gl, onLost]);
  return null;
}

/** The r3f Canvas used by Scene3D (lazy chunk: three + r3f + drei load only here). */
export default function CanvasHost({ rootRef, dpr, frameloop, camera, orthographic, eventSource, flat, transparent, antialias, watchdog, onFirstFrame, onLost, children }: CanvasHostProps) {
  const steps = React.useMemo(() => {
    const max = Math.min(dpr[1], typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    return Array.from(new Set([max, Math.min(max, 1.25), Math.max(dpr[0], 1)])).sort((a, b) => b - a);
  }, [dpr]);
  const [stepIdx, setStepIdx] = React.useState(0);
  const atMinDpr = React.useRef(steps.length === 1);
  atMinDpr.current = stepIdx >= steps.length - 1;
  const [source] = React.useState<HTMLElement | undefined>(() => {
    const root = rootRef.current;
    if (!root || eventSource === "none") return undefined;
    if (eventSource === "section") return (root.closest("section") as HTMLElement | null) ?? root;
    return root;
  });

  return (
    <Canvas
      dpr={steps[stepIdx] ?? 1}
      frameloop={frameloop}
      orthographic={orthographic}
      camera={{ fov: camera?.fov ?? 45, position: camera?.position ?? [0, 0, 6], near: camera?.near ?? 0.1, far: camera?.far ?? 200, ...(camera?.zoom ? { zoom: camera.zoom } : null) }}
      gl={{ antialias, alpha: transparent, powerPreference: "high-performance", stencil: false, preserveDrawingBuffer: false }}
      flat={flat}
      eventSource={source}
      eventPrefix={source ? "client" : undefined}
      style={{ position: "absolute", inset: 0, pointerEvents: eventSource === "none" ? "none" : undefined }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.domElement.setAttribute("aria-hidden", "true");
        gl.domElement.setAttribute("tabindex", "-1");
      }}
    >
      <ContextLossGuard onLost={onLost} />
      {frameloop === "always" ? (
        <PerformanceMonitor
          flipflops={4}
          onDecline={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))}
          onIncline={() => setStepIdx((i) => Math.max(0, i - 1))}
        />
      ) : null}
      <FrameWatch onFirstFrame={onFirstFrame} onSlow={onLost} watchdog={watchdog} atMinDpr={atMinDpr} />
      <React.Suspense fallback={null}>{children}</React.Suspense>
    </Canvas>
  );
}
