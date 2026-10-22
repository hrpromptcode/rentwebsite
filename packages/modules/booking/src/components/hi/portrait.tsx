import * as React from "react";
import { UserRound } from "lucide-react";
import { DisplaceImage } from "@rentweb/ui/fx";
import { cn } from "@rentweb/ui/lib/utils";
import { frameClass, type Look } from "./look";

/** Bigger Unsplash renditions for portraits (seed data stores w=800 crops; pravatar stays as is). */
export function portraitSrc(src: string, w = 720): string {
  if (!/images\.unsplash\.com/.test(src)) return src;
  let out = /[?&]w=\d+/.test(src) ? src.replace(/([?&]w=)\d+/, `$1${w}`) : `${src}${src.includes("?") ? "&" : "?"}w=${w}`;
  if (!/[?&]h=\d+/.test(out)) out += `&h=${Math.round(w * 1.25)}`;
  if (!/[?&]crop=/.test(out)) out += "&crop=faces";
  return out;
}

const initialsOf = (name: string) => name.replace(/^(พี่|คุณ|ครู|ดร\.|นพ\.|พญ\.|ทพ\.|ทพญ\.)\s*/u, "").slice(0, 2);

/**
 * Staff / instructor portrait in the business motif frame (arch · pebble · capsule · round). Fine pointers get the liquid
 * displacement hover (DisplaceImage); `mono` starts desaturated and blooms to colour on hover/focus of the `.group`.
 * Without a photo: the person's colour + initials. Decorative when `alt` is empty (the name is next to it).
 */
export function Portrait({
  src,
  alt = "",
  name,
  color,
  look,
  aspect = "aspect-[4/5]",
  mono = false,
  displace = true,
  priority = false,
  className,
  children,
}: {
  src: string | null | undefined;
  alt?: string;
  name: string;
  color?: string | null;
  look: Look;
  aspect?: string;
  mono?: boolean;
  displace?: boolean;
  priority?: boolean;
  className?: string;
  /** overlay content inside the frame (credential reveal, chips) */
  children?: React.ReactNode;
}) {
  const frame = cn("bk-frame bk-zoom", frameClass(look, "portrait"), aspect, className);
  if (!src) {
    return (
      <div className={frame} style={{ background: color ?? "var(--primary)" }}>
        <span aria-hidden className="absolute inset-0 flex items-center justify-center font-heading text-5xl font-semibold text-white/90">
          {initialsOf(name) || <UserRound className="size-12" />}
        </span>
        {children}
      </div>
    );
  }
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={portraitSrc(src)} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : undefined} className={cn("bk-cover", mono && "bk-mono")} />
  );
  return (
    <div className={frame}>
      {displace ? (
        <DisplaceImage className="absolute inset-0 size-full" strength={16}>
          {img}
        </DisplaceImage>
      ) : (
        img
      )}
      {children}
    </div>
  );
}
