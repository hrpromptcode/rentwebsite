"use client";

import * as React from "react";
import { Aurora, Blobs, GradientMesh, GridPattern, NoiseGradient, Waves } from "./backgrounds";
import { Particles } from "./particles";
import { Spotlight } from "./spotlight";

const LazyOrb = React.lazy(() => import("../three/orb-scene").then((m) => ({ default: m.OrbScene })));

export type HeroBackgroundKind = "none" | "gradient-mesh" | "aurora" | "particles" | "orb-3d" | "grid" | "noise" | "blobs" | "waves" | "spotlight";

function useAllow3D() {
  const [ok, setOk] = React.useState(false);
  React.useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.matchMedia("(max-width: 640px)").matches;
    const saveData = (navigator as any).connection?.saveData === true;
    const webgl = (() => {
      try {
        const c = document.createElement("canvas");
        return !!(c.getContext("webgl2") || c.getContext("webgl"));
      } catch {
        return false;
      }
    })();
    setOk(!reduce && !small && !saveData && webgl);
  }, []);
  return ok;
}

/** Decorative background chosen by the tenant theme. Always absolutely positioned inside a `relative` hero. */
export function HeroBackground({ kind, className }: { kind: HeroBackgroundKind; className?: string }) {
  const allow3D = useAllow3D();
  switch (kind) {
    case "gradient-mesh":
      return <GradientMesh className={className} />;
    case "aurora":
      return <Aurora className={className} />;
    case "blobs":
      return <Blobs className={className} />;
    case "grid":
      return <GridPattern className={className} />;
    case "noise":
      return <NoiseGradient className={className} />;
    case "waves":
      return (
        <>
          <GradientMesh className={className} />
          <Waves />
        </>
      );
    case "spotlight":
      return <Spotlight className={className} />;
    case "particles":
      return (
        <>
          <GradientMesh className={className} />
          <Particles />
        </>
      );
    case "orb-3d":
      return (
        <>
          <GradientMesh className={className} />
          {allow3D ? (
            <React.Suspense fallback={null}>
              <LazyOrb />
            </React.Suspense>
          ) : (
            <Particles density={0.6} connect={false} />
          )}
        </>
      );
    default:
      return null;
  }
}
