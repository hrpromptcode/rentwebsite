"use client";

import * as React from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { MessageCircle } from "lucide-react";

/**
 * Client half of FloatingChat: hides itself on the given route segments. useSelectedLayoutSegment reads the router
 * tree of the tenant layout (the rewritten /rw/[tenantId]/… route), so server and client agree — no hydration mismatch,
 * and it updates on client-side navigation (the layout itself does not re-render).
 * Colours: label pill #067A36 + white = 5.46:1 (WCAG AA for 14px text); the icon keeps the LINE brand green.
 */
export function FloatingChatLink({ href, label, hideOnSegments }: { href: string; label: string; hideOnSegments: string[] }) {
  const segment = useSelectedLayoutSegment();
  if (segment && hideOnSegments.includes(segment)) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-floating-chat
      aria-label={label}
      className="group fixed right-4 bottom-4 z-40 flex h-13 items-center gap-2 rounded-full bg-[#067A36] pr-5 pl-2 text-white shadow-lg shadow-black/20 transition hover:scale-105 hover:bg-[#05692E] hover:shadow-xl md:right-6 md:bottom-6"
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-[#06C755]" aria-hidden>
        <MessageCircle className="size-5" />
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </a>
  );
}
