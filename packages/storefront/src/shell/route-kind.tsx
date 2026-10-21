"use client";

import * as React from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { routeKindOf, type RouteKindValue } from "./route-kind-shared";

/**
 * "marketing" | "operational" for the current tenant route (§6.2). Uses `useSelectedLayoutSegment()` from the tenant
 * layout (the rewritten /rw/[tenantId]/… tree), the same mechanism as FloatingChatLink, so server and client agree.
 */
export function useRouteKind(): RouteKindValue {
  return routeKindOf(useSelectedLayoutSegment());
}

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/** Keeps `html[data-route]` in sync on client navigation (the layout itself does not re-render). */
export function RouteKind() {
  const kind = useRouteKind();
  useIsoLayoutEffect(() => {
    document.documentElement.dataset.route = kind;
  }, [kind]);
  return null;
}
