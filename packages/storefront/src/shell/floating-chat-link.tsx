"use client";

import * as React from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { Magnetic } from "@rentweb/ui/motion/magnetic";
import { LineIcon } from "./social";

const PEEK_KEY = "rw-chat-peek";

/**
 * Client half of FloatingChat (§6.3, fixes A11): a 56px LINE circle whose label pill expands on hover / keyboard focus
 * (fine pointers) and peeks open for 4s on the first page of a session on phones, then collapses so it never covers
 * content. Enters with a spring scale after 1.2s (static under reduced motion). Magnetic on desktop.
 * Hides itself on the given route segments: useSelectedLayoutSegment reads the router tree of the tenant layout (the
 * rewritten /rw/[tenantId]/… route), so server and client agree — no hydration mismatch — and it updates on client
 * navigation. The label text stays in the link (accessible name + `aria-label`).
 * Colours: #067A36 + white = 5.46:1 (WCAG AA for 14px text); the icon disc keeps the LINE brand green.
 */
export function FloatingChatLink({ href, label, hideOnSegments }: { href: string; label: string; hideOnSegments: string[] }) {
  const segment = useSelectedLayoutSegment();
  const ref = React.useRef<HTMLAnchorElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
    try {
      if (sessionStorage.getItem(PEEK_KEY)) return;
      sessionStorage.setItem(PEEK_KEY, "1");
    } catch {
      /* private mode: peek anyway */
    }
    el.setAttribute("data-peek", "true");
    const t = setTimeout(() => el.setAttribute("data-peek", "false"), 5200); // 1.2s enter + 4s open
    return () => clearTimeout(t);
  }, []);

  if (segment && hideOnSegments.includes(segment)) return null;
  return (
    <a ref={ref} href={href} target="_blank" rel="noreferrer" data-floating-chat="" aria-label={label} className="rw-chat" data-peek="false" suppressHydrationWarning>
      <Magnetic max={8} className="rw-chat-magnet">
        <span className="rw-chat-icon" aria-hidden>
          <LineIcon className="size-6" />
        </span>
        <span className="rw-chat-label">
          <span>{label}</span>
        </span>
      </Magnetic>
    </a>
  );
}
