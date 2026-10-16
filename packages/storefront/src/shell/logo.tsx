import * as React from "react";
import Link from "next/link";
import { cn } from "@rentweb/ui/lib/utils";
import type { StorefrontCtx } from "../ctx";

export function Logo({ ctx, className, inverse = false, size = "md" }: { ctx: StorefrontCtx; className?: string; inverse?: boolean; size?: "sm" | "md" | "lg" }) {
  const brand = ctx.theme.brand;
  const src = inverse && brand.logoDark ? brand.logoDark : brand.logo;
  const h = size === "lg" ? "h-12 md:h-14" : size === "sm" ? "h-7" : "h-8 md:h-9";
  return (
    <Link href="/" className={cn("inline-flex min-h-11 items-center gap-2.5", className)} aria-label={ctx.tenant.name}>
      {src ? (
        <img src={src} alt={ctx.tenant.name} className={cn(h, "w-auto")} />
      ) : (
        <span className={cn("font-heading font-semibold tracking-tight", size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-xl md:text-2xl")}>
          {brand.logoText ?? ctx.tenant.name}
        </span>
      )}
      {src && brand.showName && <span className="font-heading text-lg font-semibold">{ctx.tenant.name}</span>}
    </Link>
  );
}
