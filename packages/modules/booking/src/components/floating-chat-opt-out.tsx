import * as React from "react";
import { FloatingChatOptOut as ShellOptOut } from "@rentweb/storefront";

/**
 * Booking-widget wrapper around the shell's FloatingChatOptOut (packages/storefront/src/shell/floating-chat-opt-out.tsx):
 * hides the floating LINE button while the embedded widget is on a phone screen (web_visual SBR-018 follow-up).
 * Keeps the `data-booking-widget-root` hook used by tooling/qa scripts.
 */
export function FloatingChatOptOut({ children, query }: { children: React.ReactNode; query?: string }) {
  return (
    <ShellOptOut query={query}>
      <div data-booking-widget-root>{children}</div>
    </ShellOptOut>
  );
}
