import * as React from "react";
import Link from "next/link";
import * as Icons from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { Reveal } from "@rentweb/ui/motion";

export function SectionHeading({
  eyebrow,
  heading,
  subheading,
  align = "center",
  className,
  size = "md",
}: {
  eyebrow?: string;
  heading?: string;
  subheading?: string;
  align?: "left" | "center";
  className?: string;
  size?: "md" | "lg";
}) {
  if (!eyebrow && !heading && !subheading) return null;
  return (
    <Reveal className={cn("mb-10 max-w-3xl md:mb-14", align === "center" ? "mx-auto text-center" : "text-left", className)}>
      {eyebrow && <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-primary-ink uppercase">{eyebrow}</p>}
      {heading && (
        <h2 className={cn("font-heading font-semibold text-balance", size === "lg" ? "text-4xl md:text-6xl" : "text-3xl md:text-5xl")}>{heading}</h2>
      )}
      {subheading && <p className="mt-4 text-base leading-relaxed text-muted-foreground md:text-lg">{subheading}</p>}
    </Reveal>
  );
}

export function Icon({ name, className }: { name?: string; className?: string }) {
  const Cmp = (name && (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]) || Icons.Sparkles;
  return <Cmp className={className} />;
}

export function Section({ children, className, id, tone = "default" }: { children: React.ReactNode; className?: string; id?: string; tone?: "default" | "muted" | "surface" | "primary" | "foreground" }) {
  return (
    <section
      id={id}
      className={cn(
        "section relative",
        tone === "muted" && "bg-muted",
        tone === "surface" && "bg-surface",
        tone === "primary" && "bg-primary text-primary-foreground",
        tone === "foreground" && "bg-foreground text-background",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SmartLink({ href, className, children, ...rest }: React.ComponentProps<typeof Link> & { href: string }) {
  const external = /^https?:\/\//.test(href) || href.startsWith("tel:") || href.startsWith("mailto:");
  if (external) {
    return (
      <a href={href} className={className} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}

/** Renders plain text with blank-line paragraphs and single newlines as <br/>. */
export function Prose({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const paras = text.split(/\n{2,}/);
  return (
    <div className={cn("space-y-4 leading-relaxed", className)}>
      {paras.map((p, i) => (
        <p key={i}>
          {p.split("\n").map((line, j, arr) => (
            <React.Fragment key={j}>
              {line}
              {j < arr.length - 1 && <br />}
            </React.Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

export function Img({ src, alt, className, sizes, priority }: { src: string; alt?: string; className?: string; sizes?: string; priority?: boolean }) {
  if (!src) return <div className={cn("bg-muted", className)} aria-hidden />;
  // Plain <img> keeps the package independent from next/image loader config; CDN handles resizing.
  return (
    <img
      src={src}
      alt={alt ?? ""}
      className={className}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : undefined}
    />
  );
}
