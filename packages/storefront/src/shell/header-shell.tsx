"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@rentweb/ui/lib/utils";

/**
 * Sticky/transparent header behaviour. Becomes solid after scrolling; detects a dark hero
 * (`[data-hero-dark]`) to switch to light text while transparent.
 * Publishes the height the header covers at the top of the viewport as `--header-h` on <html> (0px when it does not
 * stick), so sticky panels (`top-[calc(var(--header-h)+1rem)]`) and scroll-padding-top clear every header variant
 * (the centred two-row header is ~137px at desktop; RESPONSIVE_B2-12). globals.css has SSR estimates keyed on
 * `data-site-header` / `data-sticky`; the measured value (inline style on <html>) replaces them after hydration.
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
  const ref = React.useRef<HTMLElement>(null);

  const pathname = usePathname();

  // re-detect on every client navigation: the header persists across pages, the hero under it does not
  React.useEffect(() => {
    const detect = () => setOnDark(!!document.querySelector("[data-hero-dark]"));
    detect();
    const raf = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return;
    const set = () => root.style.setProperty("--header-h", sticky ? `${Math.round(el.getBoundingClientRect().height)}px` : "0px");
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--header-h");
    };
  }, [sticky]);

  const isTransparent = transparent && !scrolled;

  if (variant === "floating") {
    return (
      <header
        ref={ref}
        data-site-header={variant}
        data-sticky="true"
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
      ref={ref}
      data-site-header={variant}
      data-sticky={sticky ? "true" : "false"}
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
