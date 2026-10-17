import * as React from "react";
import { contactOf, type StorefrontCtx } from "../ctx";
import { lineChat } from "../line";
import { FloatingChatLink } from "./floating-chat-link";

/**
 * Route segments (directly under the tenant root) where the floating button would sit on top of a full-page
 * interactive flow on phones — the booking wizard's calendar/slot chips (/book) and the reschedule panel
 * (/bookings/[id]). Embedded widgets elsewhere opt out with a `data-hide-floating-chat` element (globals.css).
 */
const HIDE_ON_SEGMENTS = ["book", "bookings"];

/** Floating LINE chat button (very common expectation for Thai customers). */
export function FloatingChat({ ctx }: { ctx: StorefrontCtx }) {
  const c = contactOf(ctx);
  const href = lineChat(c)?.href; // ADMIN_B2-10: "@oa" / personal id / full LINE URL, never a dead link
  if (!href) return null;
  return <FloatingChatLink href={href} label={ctx.t("common.lineChat")} hideOnSegments={HIDE_ON_SEGMENTS} />;
}
