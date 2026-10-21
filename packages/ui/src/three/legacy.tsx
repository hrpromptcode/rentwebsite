"use client";

import * as React from "react";

const LazyOrb = React.lazy(() => import("./orb-scene").then((m) => ({ default: m.OrbScene })));
const LazyShapes = React.lazy(() => import("./floating-shapes").then((m) => ({ default: m.FloatingShapes })));

/** @deprecated pre-redesign hero orb; prefer ParticleMorph / FloatingObjects. Lazy wrapper (no eager three.js). */
export function OrbScene(props: { className?: string }) {
  return (
    <React.Suspense fallback={null}>
      <LazyOrb {...props} />
    </React.Suspense>
  );
}

/** @deprecated pre-redesign shapes; prefer FloatingObjects. Lazy wrapper (no eager three.js). */
export function FloatingShapes(props: { className?: string; colors?: string[] }) {
  return (
    <React.Suspense fallback={null}>
      <LazyShapes {...props} />
    </React.Suspense>
  );
}
