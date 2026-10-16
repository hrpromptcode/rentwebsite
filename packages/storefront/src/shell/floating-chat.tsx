import * as React from "react";
import { MessageCircle } from "lucide-react";
import { contactOf, type StorefrontCtx } from "../ctx";

/** Floating LINE chat button (very common expectation for Thai customers). */
export function FloatingChat({ ctx }: { ctx: StorefrontCtx }) {
  const c = contactOf(ctx);
  if (!c.lineId && !c.lineUrl) return null;
  const href = c.lineUrl ?? `https://line.me/R/ti/p/${encodeURIComponent(c.lineId!)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-floating-chat
      aria-label={ctx.t("common.lineChat")}
      className="group fixed right-4 bottom-4 z-40 flex h-13 items-center gap-2 rounded-full bg-[#06C755] pr-5 pl-3.5 text-white shadow-lg shadow-black/20 transition hover:scale-105 hover:shadow-xl md:right-6 md:bottom-6"
    >
      <MessageCircle className="size-6" />
      <span className="text-sm font-semibold">{ctx.t("common.lineChat")}</span>
    </a>
  );
}
