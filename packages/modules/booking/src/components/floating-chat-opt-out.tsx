"use client";

import * as React from "react";

/**
 * Hides the shell's floating LINE button while the embedded booking widget is on screen on a phone, so the button
 * never covers calendar cells / time slots (web_visual SBR-018 follow-up). Uses the shell's opt-out hook: any
 * element with `data-hide-floating-chat` hides `[data-floating-chat]` (packages/ui globals.css). On wider screens,
 * or while the widget is scrolled out of view, the button stays (it is the shop's main contact on the home page).
 */
export function FloatingChatOptOut({ children, query = "(width < 48rem)" }: { children: React.ReactNode; query?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [hide, setHide] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const mq = window.matchMedia(query);
    let inView = false;
    const update = () => setHide(inView && mq.matches);
    const io = new IntersectionObserver(([entry]) => {
      inView = !!entry?.isIntersecting;
      update();
    });
    io.observe(el);
    mq.addEventListener("change", update);
    return () => {
      io.disconnect();
      mq.removeEventListener("change", update);
    };
  }, [query]);

  return (
    <div ref={ref} data-booking-widget-root>
      {hide && <span data-hide-floating-chat hidden />}
      {children}
    </div>
  );
}
