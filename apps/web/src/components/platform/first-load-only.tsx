"use client";

import * as React from "react";

const noop = () => () => {};

/**
 * Renders its children only when they arrive with the server HTML (a hard page load, hydrated in place) and never on a
 * client-side mount (soft navigation back to the page). For the kit Preloader: its inline `<script>` must run before first
 * paint, which only a document load can do, and React 19 reports every `<script>` it has to create on the client as a
 * console error ("Encountered a script tag while rendering React component" — the dev indicator's "1 Issue" after
 * navigating /templates → /). The useSyncExternalStore server snapshot is what hydration sees; the decision is latched in
 * state so the hydrated preloader keeps running after React switches to the client snapshot.
 */
export function FirstLoadOnly({ children }: { children: React.ReactNode }) {
  const hydrating = React.useSyncExternalStore(
    noop,
    () => false,
    () => true,
  );
  const [keep] = React.useState(hydrating);
  return keep ? <>{children}</> : null;
}
