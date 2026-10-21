import * as React from "react";

/**
 * Tiny wireframe thumbnails for the "เพิ่มเซ็กชัน" dialog (one per core / hi-end section type; module sections get
 * their category glyph). Pure SVG in currentColor + the admin primary, so they follow the admin theme.
 */
const P = "var(--primary)";

const THUMBS: Record<string, React.ReactNode> = {
  hero: (
    <>
      <rect x="6" y="9" width="24" height="5" rx="1.5" fill="currentColor" opacity=".8" />
      <rect x="6" y="16" width="18" height="5" rx="1.5" fill="currentColor" opacity=".8" />
      <rect x="6" y="25" width="10" height="4" rx="2" fill={P} />
      <rect x="36" y="6" width="22" height="30" rx="4" fill={P} opacity=".25" />
      <circle cx="47" cy="21" r="7" fill={P} opacity=".7" />
    </>
  ),
  features: (
    <>
      {[6, 26, 46].map((x) => (
        <g key={x}>
          <rect x={x} y="8" width="14" height="28" rx="3" fill="currentColor" opacity=".12" />
          <rect x={x + 3} y="11" width="5" height="5" rx="1.5" fill={P} />
          <rect x={x + 3} y="27" width="8" height="2.5" rx="1" fill="currentColor" opacity=".6" />
        </g>
      ))}
    </>
  ),
  text: (
    <>
      <rect x="6" y="10" width="20" height="5" rx="1.5" fill="currentColor" opacity=".8" />
      {[10, 16, 22, 28].map((y) => (
        <rect key={y} x="32" y={y} width={y === 28 ? 16 : 26} height="2.5" rx="1" fill="currentColor" opacity=".35" />
      ))}
    </>
  ),
  "image-text": (
    <>
      <rect x="6" y="7" width="26" height="30" rx="3" fill={P} opacity=".3" />
      <rect x="38" y="12" width="20" height="4" rx="1.5" fill="currentColor" opacity=".8" />
      <rect x="38" y="20" width="18" height="2.5" rx="1" fill="currentColor" opacity=".35" />
      <rect x="38" y="25" width="14" height="2.5" rx="1" fill="currentColor" opacity=".35" />
    </>
  ),
  gallery: (
    <>
      <rect x="6" y="7" width="16" height="20" rx="2" fill={P} opacity=".35" />
      <rect x="24" y="7" width="16" height="13" rx="2" fill="currentColor" opacity=".2" />
      <rect x="42" y="7" width="16" height="24" rx="2" fill={P} opacity=".25" />
      <rect x="24" y="22" width="16" height="15" rx="2" fill={P} opacity=".45" />
    </>
  ),
  testimonials: (
    <>
      <rect x="6" y="9" width="24" height="18" rx="6" fill="currentColor" opacity=".14" />
      <rect x="32" y="17" width="26" height="18" rx="6" fill={P} opacity=".35" />
      <text x="10" y="21" fontSize="10" fill={P}>“</text>
    </>
  ),
  faq: (
    <>
      {[8, 18, 28].map((y) => (
        <g key={y}>
          <rect x="6" y={y} width="44" height="3" rx="1" fill="currentColor" opacity=".5" />
          <path d={`M54 ${y + 1.5}h4M56 ${y - 0.5}v4`} stroke={P} strokeWidth="1.5" />
        </g>
      ))}
    </>
  ),
  cta: (
    <>
      <rect x="4" y="6" width="56" height="32" rx="4" fill="currentColor" opacity=".85" />
      <rect x="10" y="14" width="26" height="5" rx="1.5" fill="white" opacity=".85" />
      <circle cx="49" cy="22" r="7" fill={P} />
    </>
  ),
  contact: (
    <>
      <rect x="6" y="9" width="18" height="3" rx="1" fill="currentColor" opacity=".6" />
      <rect x="6" y="16" width="14" height="3" rx="1" fill="currentColor" opacity=".35" />
      <rect x="30" y="8" width="28" height="6" rx="2" fill="currentColor" opacity=".14" />
      <rect x="30" y="17" width="28" height="11" rx="2" fill="currentColor" opacity=".14" />
      <rect x="30" y="31" width="12" height="5" rx="2.5" fill={P} />
    </>
  ),
  stats: (
    <>
      {[6, 26, 46].map((x, i) => (
        <text key={x} x={x} y="26" fontSize="13" fontWeight="700" fill={i === 1 ? P : "currentColor"}>
          {["12", "98", "5+"][i]}
        </text>
      ))}
    </>
  ),
  logos: (
    <>
      {[6, 22, 38, 54].map((x) => (
        <rect key={x} x={x} y="18" width="10" height="7" rx="1.5" fill="currentColor" opacity=".35" />
      ))}
    </>
  ),
  marquee: (
    <>
      <rect x="0" y="15" width="64" height="14" fill="currentColor" opacity=".85" />
      <text x="2" y="25" fontSize="8" fill="white" opacity=".9">ABC ✦ DEF ✦ GH</text>
    </>
  ),
  pricing: (
    <>
      {[6, 25, 44].map((x, i) => (
        <rect key={x} x={x} y={i === 1 ? 5 : 9} width="15" height={i === 1 ? 32 : 28} rx="3" fill={i === 1 ? P : "currentColor"} opacity={i === 1 ? 0.45 : 0.14} />
      ))}
    </>
  ),
  team: (
    <>
      {[6, 21, 36, 51].map((x, i) => (
        <rect key={x} x={x} y={i % 2 ? 12 : 8} width="11" height="15" rx="2" fill="currentColor" opacity=".25" />
      ))}
    </>
  ),
  video: (
    <>
      <rect x="6" y="7" width="52" height="30" rx="4" fill="currentColor" opacity=".8" />
      <circle cx="32" cy="22" r="7" fill="white" />
      <path d="M30 19l5 3-5 3z" fill="currentColor" />
    </>
  ),
  steps: (
    <>
      <path d="M12 16H52" stroke={P} strokeWidth="1.5" />
      {[12, 32, 52].map((x) => (
        <circle key={x} cx={x} cy="16" r="4.5" fill={P} />
      ))}
      {[6, 26, 46].map((x) => (
        <rect key={x} x={x} y="26" width="12" height="2.5" rx="1" fill="currentColor" opacity=".5" />
      ))}
    </>
  ),
  spacer: <path d="M6 22H58" stroke="currentColor" strokeDasharray="3 3" opacity=".6" />,
  announcement: (
    <>
      <rect x="0" y="16" width="64" height="10" fill={P} opacity=".7" />
      <rect x="18" y="20" width="28" height="2.5" rx="1" fill="white" />
    </>
  ),
  "curved-gallery": (
    <>
      <path d="M4 34L20 26M60 34L44 26M18 40h28" stroke="currentColor" opacity=".3" />
      {[
        [4, 12, -18],
        [18, 9, -8],
        [32, 8, 0],
        [46, 9, 8],
      ].map(([x, y, r], i) => (
        <rect key={i} x={x} y={y} width="13" height="16" rx="2" fill={i === 2 ? P : "currentColor"} opacity={i === 2 ? 0.6 : 0.25} transform={`rotate(${r} ${(x as number) + 6} ${(y as number) + 8})`} />
      ))}
    </>
  ),
  "sticky-story": (
    <>
      {[9, 18, 27].map((y, i) => (
        <rect key={y} x="6" y={y} width="22" height="4" rx="1.5" fill="currentColor" opacity={i === 1 ? 0.85 : 0.25} />
      ))}
      <rect x="34" y="6" width="24" height="32" rx="3" fill={P} opacity=".35" />
    </>
  ),
  tunnel: (
    <>
      {[16, 12, 8, 4].map((r, i) => (
        <ellipse key={r} cx="32" cy="22" rx={r * 1.6} ry={r} fill="none" stroke={P} opacity={0.25 + i * 0.18} />
      ))}
    </>
  ),
  "giant-wordmark": (
    <text x="3" y="31" fontSize="21" fontWeight="800" letterSpacing="-1" fill="currentColor">
      BRAND
    </text>
  ),
  "horizontal-scroll": (
    <>
      {[2, 22, 42, 62].map((x, i) => (
        <rect key={x} x={x} y="8" width="17" height="24" rx="3" fill={i === 1 ? P : "currentColor"} opacity={i === 1 ? 0.5 : 0.2} />
      ))}
      <path d="M22 37h20" stroke="currentColor" opacity=".5" />
    </>
  ),
  "project-list": (
    <>
      {[10, 20, 30].map((y) => (
        <rect key={y} x="6" y={y} width="30" height="4" rx="1.5" fill="currentColor" opacity=".7" />
      ))}
      <rect x="40" y="12" width="18" height="13" rx="2" fill={P} opacity=".5" transform="rotate(-6 49 18)" />
    </>
  ),
  interlude: (
    <>
      <rect x="2" y="4" width="60" height="36" rx="4" fill="currentColor" opacity=".85" />
      {Array.from({ length: 18 }).map((_, i) => (
        <circle key={i} cx={(32 + Math.cos(i) * (8 + (i % 4) * 3)).toFixed(2)} cy={(22 + Math.sin(i * 1.3) * (6 + (i % 3) * 2)).toFixed(2)} r="1" fill={P} />
      ))}
    </>
  ),
};

const BY_CATEGORY: Record<string, string> = {
  commerce: "features",
  booking: "steps",
  topup: "features",
  restaurant: "gallery",
  clinic: "pricing",
  rental: "gallery",
  events: "horizontal-scroll",
  hero: "hero",
  content: "text",
  media: "gallery",
  social: "testimonials",
  cta: "cta",
  layout: "spacer",
};

export function SectionThumb({ type, category, className }: { type: string; category: string; className?: string }) {
  const body = THUMBS[type] ?? THUMBS[BY_CATEGORY[category] ?? "text"];
  return (
    <svg viewBox="0 0 64 44" aria-hidden className={className}>
      {body}
    </svg>
  );
}
