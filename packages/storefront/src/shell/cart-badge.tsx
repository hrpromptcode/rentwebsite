"use client";

import * as React from "react";

/**
 * Header cart count badge. Its text is ONLY the number (journeys read `header a[href="/cart"]` text). It bounces when
 * the server-rendered count changes (router.refresh after add-to-cart) or when something dispatches
 * `window.dispatchEvent(new Event("rw:cart-bump"))` (e.g. the fly-to-cart animation landing on `[data-cart-icon]`).
 */
export function CartBadge({ count }: { count: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const prev = React.useRef(count);

  const bump = React.useCallback(() => {
    const el = ref.current?.closest<HTMLElement>("[data-cart-icon]");
    if (!el) return;
    el.removeAttribute("data-bump");
    void el.offsetWidth; // restart the CSS animation
    el.setAttribute("data-bump", "");
  }, []);

  React.useEffect(() => {
    if (prev.current !== count && count > 0) bump();
    prev.current = count;
  }, [count, bump]);

  React.useEffect(() => {
    window.addEventListener("rw:cart-bump", bump);
    return () => window.removeEventListener("rw:cart-bump", bump);
  }, [bump]);

  if (!count) return <span ref={ref} hidden />;
  return (
    <span ref={ref} className="rw-cart-badge" data-cart-badge="">
      {count}
    </span>
  );
}
