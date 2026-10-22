import * as React from "react";
import { cn } from "@rentweb/ui/lib/utils";

/** chunks longer than this (graphemes) may still wrap inside, so a long unspaced name never overflows a phone */
const KEEP_MAX = 14;

let gseg: Intl.Segmenter | null | undefined;
function graphemeLen(s: string): number {
  if (gseg === undefined) gseg = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "grapheme" }) : null;
  return gseg ? Array.from(gseg.segment(s)).length : s.length;
}

type Tag = "h1" | "h2" | "h3" | "p" | "span";

/**
 * Room and other proper names. Thai transliterated loanwords segment badly ("บีชฟรอนต์" → บีชฟ|รอน|ต์, "แฟมิลี่" →
 * แฟ|มิ|ลี่), and `text-wrap: balance` happily breaks at those points ("บีชฟรอน / ต์"). Each space-separated chunk is
 * kept whole (`white-space: nowrap`, inline, so accessible names and text matches stay unchanged), so names only
 * wrap at their spaces. `reveal` = per-chunk mask rise on mount (CSS, no-preference only; the heading gets an
 * aria-label because the chunks become inline-blocks).
 */
export function RoomName({ name, as: Comp = "span", reveal, delay = 0.15, className, id }: { name: string; as?: Tag; reveal?: boolean; delay?: number; className?: string; id?: string }) {
  const parts = name.split(/(\s+)/).filter(Boolean);
  let n = 0;
  return (
    <Comp id={id} className={cn(reveal && "rw-name-rise", className)} aria-label={reveal ? name : undefined}>
      {parts.map((p, i) => {
        if (/^\s+$/.test(p)) return " ";
        const keep = graphemeLen(p) <= KEEP_MAX;
        if (!reveal) return keep ? <span key={i} className="whitespace-nowrap">{p}</span> : <React.Fragment key={i}>{p}</React.Fragment>;
        const d = delay + n++ * 0.09;
        return (
          <span key={i} className={cn("rw-name-mask", keep && "whitespace-nowrap")}>
            <span className="rw-name-word" style={{ "--d": `${d.toFixed(2)}s` } as React.CSSProperties}>
              {p}
            </span>
          </span>
        );
      })}
    </Comp>
  );
}
