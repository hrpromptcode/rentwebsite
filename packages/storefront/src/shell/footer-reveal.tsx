"use client";

import * as React from "react";

/**
 * Sticky "reveal" footer helper (§6.3, big layout): marks the footer `data-fits="true"` while it is shorter than the
 * viewport, so the CSS (≥ 1024px, expressive motion, marketing routes, no reduced motion) can pin it under the page
 * (`position: sticky; bottom: 0`) and let <main> slide off it. A footer taller than the viewport never pins (its top
 * would be unreachable).
 */
export function FooterReveal() {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    const footer = ref.current?.closest<HTMLElement>("footer");
    if (!footer) return;
    const check = () => footer.setAttribute("data-fits", String(footer.offsetHeight < window.innerHeight - 24));
    check();
    const ro = new ResizeObserver(check);
    ro.observe(footer);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);
  return <span ref={ref} hidden />;
}
