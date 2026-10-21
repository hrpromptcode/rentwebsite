"use client";

import * as React from "react";
import * as THREE from "three";
import { readThemeHex, subscribeThemeChange, isDarkColor } from "./theme-colors";
import type { TokenOrColor } from "./types";

export type ThemeColorMap<K extends string> = Record<K, THREE.Color> & {
  /** bumps whenever any colour changed (use as a memo/effect dependency). */
  readonly version: number;
  /** true when `background` (or the first colour) is dark — additive glow reads well, else use normal blending. */
  readonly dark: boolean;
};

const DEFAULT_KEYS = ["primary", "accent", "glow", "background", "foreground", "surface"] as const;

/**
 * Theme colours as THREE.Color (sRGB → linear handled by three's ColorManagement). The returned objects are
 * STABLE: they are mutated in place on theme change, so shader uniforms that reference them update without
 * re-creating materials. The hook also re-renders (version bump) so JSX colour props follow.
 *
 * `keys` are token names or CSS colours. Only for code inside packages/ui/src/three/impl (imports three).
 */
export function useThemeColors<K extends TokenOrColor = (typeof DEFAULT_KEYS)[number]>(
  keys?: readonly K[],
  scopeRef?: React.RefObject<Element | null>,
): ThemeColorMap<K> {
  const list = (keys ?? DEFAULT_KEYS) as readonly K[];
  const sig = list.join("|");
  const store = React.useMemo(() => {
    const colors = {} as Record<K, THREE.Color>;
    for (const k of sig.split("|") as K[]) colors[k] = new THREE.Color("#808080");
    return colors;
  }, [sig]);
  const [state, setState] = React.useState({ version: 0, dark: true });

  React.useLayoutEffect(() => {
    const ks = sig.split("|") as K[];
    const read = () => {
      const probeKeys = ks.includes("background" as K) ? ks : ([...ks, "background"] as K[]);
      const hex = readThemeHex(probeKeys, scopeRef?.current);
      let changed = false;
      for (const k of ks) {
        const c = store[k];
        const before = c.getHex();
        c.set(hex[k]);
        if (c.getHex() !== before) changed = true;
      }
      const dark = isDarkColor(hex["background" as K]);
      setState((s) => (changed || s.dark !== dark || s.version === 0 ? { version: s.version + 1, dark } : s));
    };
    read();
    return subscribeThemeChange(read);
  }, [sig, store, scopeRef]);

  return React.useMemo(() => Object.assign(Object.create(null), store, { version: state.version, dark: state.dark }) as ThemeColorMap<K>, [store, state]);
}
