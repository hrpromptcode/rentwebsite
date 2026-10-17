import * as React from "react";
import { cn } from "@rentweb/ui/lib/utils";

/** LINE speech-bubble mark (brand green comes from the parent). */
export function LineMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={cn("size-5", className)} fill="currentColor">
      <path d="M24 6C12.95 6 4 13.27 4 22.24c0 8.05 7.14 14.79 16.78 16.06.65.14 1.54.43 1.77.99.2.5.13 1.3.06 1.8l-.28 1.72c-.09.5-.4 1.98 1.73 1.08 2.14-.9 11.52-6.78 15.72-11.61C42.68 28.9 44 25.73 44 22.24 44 13.27 35.05 6 24 6Zm-8.1 21.1h-3.98a1.05 1.05 0 0 1-1.05-1.05v-7.97a1.05 1.05 0 0 1 2.1 0v6.92h2.93a1.05 1.05 0 1 1 0 2.1Zm3.05-1.05a1.05 1.05 0 1 1-2.1 0v-7.97a1.05 1.05 0 1 1 2.1 0v7.97Zm9.62 0a1.05 1.05 0 0 1-1.05 1.05.99.99 0 0 1-.84-.42l-4.09-5.56v4.93a1.05 1.05 0 1 1-2.1 0v-7.97a1.05 1.05 0 0 1 1.05-1.05c.33 0 .64.16.84.42l4.09 5.56v-4.93a1.05 1.05 0 1 1 2.1 0v7.97Zm6.45-5.03a1.05 1.05 0 1 1 0 2.1h-2.93v1.88h2.93a1.05 1.05 0 1 1 0 2.1h-3.98a1.05 1.05 0 0 1-1.05-1.05v-7.97a1.05 1.05 0 0 1 1.05-1.05h3.98a1.05 1.05 0 1 1 0 2.1h-2.93v1.89h2.93Z" />
    </svg>
  );
}

/**
 * "เข้าสู่ระบบด้วย LINE" – a plain link to /api/auth/line/start (no JS needed). LINE's brand green #06C755 with
 * white text passes WCAG AA for large/bold text; the button is 48px tall for thumbs.
 */
export function LineLoginButton({ next, link, className, children }: { next?: string; link?: boolean; className?: string; children?: React.ReactNode }) {
  const q = new URLSearchParams();
  if (next) q.set("next", next);
  if (link) q.set("link", "1");
  const href = `/api/auth/line/start${q.size ? `?${q.toString()}` : ""}`;
  return (
    <a
      href={href}
      data-testid="line-login-button"
      className={cn(
        "inline-flex h-12 w-full items-center justify-center gap-3 rounded-[var(--radius-lg)] bg-[#06C755] px-5 text-base font-semibold text-white shadow-sm transition",
        "hover:bg-[#05b34c] focus-visible:ring-[3px] focus-visible:ring-[#06C755]/40 focus-visible:outline-none active:scale-[0.98]",
        className,
      )}
    >
      <LineMark className="size-6" />
      {children ?? "เข้าสู่ระบบด้วย LINE"}
    </a>
  );
}
