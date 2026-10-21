import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Magnetic, RollText } from "@rentweb/ui/motion";
import { scriptOf } from "@rentweb/ui/motion/split";
export { tg } from "./thai";
import { cn } from "@rentweb/ui/lib/utils";

/** Wordmark "RentWeb●" — Unbounded 600 + the coral "online" dot (§4.1). */
export function Logo({ className, label = true }: { className?: string; label?: boolean }) {
  return (
    <span className={cn("inline-flex items-baseline gap-[0.14em] font-accent font-semibold tracking-[-0.04em]", className)} aria-label={label ? "RentWeb" : undefined} role={label ? "img" : undefined}>
      <span aria-hidden={label ? true : undefined}>RentWeb</span>
      <span className="pf-dot" aria-hidden="true" />
    </span>
  );
}

/** Tiny mono HUD label; Latin labels keep their wide tracking on the Thai page. */
export function Mono({ children, className, as: Tag = "span", ...rest }: { children: string; className?: string; as?: "span" | "p" | "div" | "dt" | "li" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn("mono-label", className)} data-script={scriptOf(children)} {...rest}>
      {children}
    </Tag>
  );
}

/** "(03) — TEMPLATES" section index */
export function SectionIndex({ n, label, className }: { n: string; label: string; className?: string }) {
  return (
    <p className={cn("mono-label flex items-center gap-3 text-muted-foreground", className)} data-script={scriptOf(label)}>
      <span className="text-primary">({n})</span>
      <span className="h-px w-10 bg-current opacity-40" aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}

function Arrow({ dir }: { dir: "right" | "up-right" }) {
  const Icon = dir === "right" ? ArrowRight : ArrowUpRight;
  return (
    <span className="pf-arrow" data-dir={dir} aria-hidden="true">
      <Icon strokeWidth={2} />
      <Icon strokeWidth={2} />
    </span>
  );
}

export interface CtaProps {
  href: string;
  children: string;
  variant?: "primary" | "ghost";
  size?: "sm" | "md" | "lg";
  arrow?: "right" | "up-right" | false;
  /** opens in a new tab (demo sites) */
  external?: boolean;
  /** client-side navigation for same-site routes */
  internal?: boolean;
  magnetic?: boolean;
  className?: string;
  cursorLabel?: string;
}

/** Pill CTA: magnetic wrapper, rolling label, arrow that slides out and back in, fill wipe on hover (§2.5). */
export function Cta({ href, children, variant = "primary", size = "md", arrow = "right", external, internal, magnetic = true, className, cursorLabel }: CtaProps) {
  const body = (
    <>
      <span data-magnetic-inner="">
        <RollText>{children}</RollText>
      </span>
      {arrow ? <Arrow dir={arrow} /> : null}
    </>
  );
  const common = {
    className: cn("pf-btn group", className),
    "data-variant": variant,
    "data-size": size === "md" ? undefined : size,
    "data-cursor": cursorLabel ? "link" : undefined,
    "data-cursor-label": cursorLabel,
  };
  const link = internal ? (
    <Link href={href} {...common}>
      {body}
    </Link>
  ) : (
    <a href={href} {...common} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {body}
    </a>
  );
  return magnetic ? <Magnetic className="inline-flex">{link}</Magnetic> : link;
}

/** RollText nav link (underline draws on hover / focus) */
export function NavLink({ href, children, className, internal = true }: { href: string; children: string; className?: string; internal?: boolean }) {
  const cls = cn("group inline-flex min-h-11 items-center", className);
  return internal ? (
    <Link href={href} className={cls}>
      <RollText underline>{children}</RollText>
    </Link>
  ) : (
    <a href={href} className={cls}>
      <RollText underline>{children}</RollText>
    </a>
  );
}
