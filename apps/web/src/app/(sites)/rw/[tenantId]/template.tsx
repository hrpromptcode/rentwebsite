"use client";

import * as React from "react";
import { RouteTransition, type RouteTransitionStyle } from "@rentweb/ui/motion/route-transition";
import { useRouteKind } from "@rentweb/storefront/shell/route-kind";

const STYLES = new Set<RouteTransitionStyle>(["none", "fade", "rise", "curtain"]);
const noop = () => () => {};

/** theme transition style from html[data-transition] (set by the theme: effects.pageTransitions=false → "none") */
function readStyle(): RouteTransitionStyle {
  const v = document.documentElement.dataset.transition as RouteTransitionStyle | undefined;
  return v && STYLES.has(v) ? v : "fade";
}

/**
 * Page transition (§2.6 / §6.3): enter-only, remounts on every navigation between top-level segments; the very first
 * page load never animates. Marketing routes use the theme's style (fade / rise / curtain); operational routes always
 * fade (or none). Hydration renders the server snapshot ("fade"), client navigations read the theme attribute.
 */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  const kind = useRouteKind();
  const themeStyle = React.useSyncExternalStore(noop, readStyle, () => "fade" as RouteTransitionStyle);
  const style: RouteTransitionStyle = themeStyle === "none" ? "none" : kind === "operational" ? "fade" : themeStyle;
  return <RouteTransition style={style}>{children}</RouteTransition>;
}
