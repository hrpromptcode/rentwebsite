"use client";

import * as React from "react";
import { cn } from "@rentweb/ui/lib/utils";

/**
 * Plays its children's chat-bubble choreography (CSS, `.rw-chat-thread[data-state=in]`) once when it scrolls into view.
 * Content is server-rendered and fully visible without JS / with reduced motion (start states are CSS-gated).
 */
export function ChatThread({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      el.dataset.state = "in";
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          el.dataset.state = "in";
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -18% 0px" },
    );
    io.observe(el);
    // focus inside before the reveal (keyboard): show everything at once
    const onFocus = () => (el.dataset.state = "in");
    el.addEventListener("focusin", onFocus);
    return () => {
      io.disconnect();
      el.removeEventListener("focusin", onFocus);
    };
  }, []);
  return (
    <div ref={ref} className={cn("rw-chat-thread", className)} data-state="idle">
      {children}
    </div>
  );
}
