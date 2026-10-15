"use client";

import * as React from "react";
import { cn } from "@rentweb/ui/lib/utils";

/**
 * Sticky/transparent header behaviour. Becomes solid after scrolling; detects a dark hero
 * (`[data-hero-dark]`) to switch to light text while transparent.
 */
export function HeaderShell({
  children,
  variant,
  transparent,
  sticky,
  className,
}: {
  children: React.ReactNode;
  variant: "classic" | "centered" | "split" | "floating" | "minimal" | "sidebar";
  transparent: boolean;
  sticky: boolean;
  className?: string;
}) {
  const [scrolled, setScrolled] = React.useState(false);
  const [onDark, setOnDark] = React.useState(false);

  React.useEffect(() => {
    setOnDark(!!document.querySelector("[data-hero-dark]"));
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isTransparent = transparent && !scrolled;

  if (variant === "floating") {
    return (
      <header
        data-scrolled={scrolled}
        className={cn("pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-3 md:px-6 md:pt-4", className)}
        style={{ color: isTransparent && onDark ? "#fff" : undefined }}
      >
        <div
          className={cn(
            "pointer-events-auto mx-auto flex h-14 max-w-6xl items-center rounded-full border px-3 transition-all duration-500 md:h-16 md:px-5",
            scrolled || !transparent ? "border-border/60 bg-background/75 shadow-lg shadow-black/5 backdrop-blur-xl" : "border-white/15 bg-background/30 backdrop-blur-md",
          )}
        >
          {children}
        </div>
      </header>
    );
  }

  return (
    <header
      data-scrolled={scrolled}
      className={cn(
        "z-40 w-full transition-[background-color,box-shadow,color,border-color] duration-500",
        sticky && (transparent ? "fixed inset-x-0 top-0" : "sticky top-0"),
        isTransparent ? "border-b border-transparent bg-transparent" : "border-b border-border/60 bg-background/80 backdrop-blur-xl",
        scrolled && "shadow-sm shadow-black/5",
        className,
      )}
      style={{ color: isTransparent && onDark ? "#fff" : undefined }}
    >
      {children}
    </header>
  );
}
