"use client";

import * as React from "react";

/**
 * The storefront kit reads theme hooks on <html> (data-preset, data-motion, data-scene3d …, the `dark` class). The lab
 * lives under the platform layout, so it mirrors the chosen tenant theme's attributes onto <html> after mount and
 * restores them when leaving.
 */
export function LabHtmlAttrs({ attrs, dark }: { attrs: Record<string, string>; dark: boolean }) {
  React.useEffect(() => {
    const html = document.documentElement;
    const prev: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(attrs)) {
      prev[k] = html.getAttribute(k);
      html.setAttribute(k, v);
    }
    const hadDark = html.classList.contains("dark");
    html.classList.toggle("dark", dark);
    window.dispatchEvent(new Event("rw:theme"));
    return () => {
      for (const [k, v] of Object.entries(prev)) {
        if (v === null) html.removeAttribute(k);
        else html.setAttribute(k, v);
      }
      html.classList.toggle("dark", hadDark);
    };
  }, [attrs, dark]);
  return null;
}
