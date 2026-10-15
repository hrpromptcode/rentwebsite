/**
 * Curated Google Fonts with Thai + Latin glyphs. The storefront declares each one with next/font
 * (see apps/web/src/fonts.ts) and exposes it as CSS variable `--font-<key>`.
 */
export type FontCategory = "sans" | "serif" | "display" | "handwriting" | "mono";

export interface FontDef {
  key: string;
  family: string; // CSS family name
  category: FontCategory;
  /** personality hints used by the admin font picker */
  mood: string[];
  weights: string[];
  recommendedFor: Array<"heading" | "body" | "display">;
}

export const FONTS: Record<string, FontDef> = {
  prompt: { key: "prompt", family: "Prompt", category: "sans", mood: ["modern", "geometric", "friendly"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["heading", "body"] },
  kanit: { key: "kanit", family: "Kanit", category: "sans", mood: ["bold", "sporty", "tech"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["heading", "body"] },
  sarabun: { key: "sarabun", family: "Sarabun", category: "sans", mood: ["neutral", "readable", "official"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["body"] },
  "noto-sans-thai": { key: "noto-sans-thai", family: "Noto Sans Thai", category: "sans", mood: ["neutral", "clean"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["body"] },
  "ibm-plex-sans-thai": { key: "ibm-plex-sans-thai", family: "IBM Plex Sans Thai", category: "sans", mood: ["corporate", "technical"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["heading", "body"] },
  mitr: { key: "mitr", family: "Mitr", category: "sans", mood: ["rounded", "friendly", "playful"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["heading", "body"] },
  "bai-jamjuree": { key: "bai-jamjuree", family: "Bai Jamjuree", category: "sans", mood: ["tech", "futuristic"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["heading", "body"] },
  "chakra-petch": { key: "chakra-petch", family: "Chakra Petch", category: "display", mood: ["gaming", "techno", "angular"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["heading", "display"] },
  anuphan: { key: "anuphan", family: "Anuphan", category: "sans", mood: ["modern", "editorial", "clean"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["heading", "body"] },
  k2d: { key: "k2d", family: "K2D", category: "sans", mood: ["casual", "warm"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["body"] },
  athiti: { key: "athiti", family: "Athiti", category: "sans", mood: ["soft", "friendly"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["body"] },
  taviraj: { key: "taviraj", family: "Taviraj", category: "serif", mood: ["elegant", "editorial", "luxury"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["heading", "display"] },
  trirong: { key: "trirong", family: "Trirong", category: "serif", mood: ["classic", "refined"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["heading"] },
  pridi: { key: "pridi", family: "Pridi", category: "serif", mood: ["slab", "sturdy", "warm"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["heading", "body"] },
  maitree: { key: "maitree", family: "Maitree", category: "serif", mood: ["calm", "literary"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["heading", "body"] },
  chonburi: { key: "chonburi", family: "Chonburi", category: "display", mood: ["heavy", "retro", "appetizing"], weights: ["400"], recommendedFor: ["display", "heading"] },
  srisakdi: { key: "srisakdi", family: "Srisakdi", category: "display", mood: ["traditional", "ornate"], weights: ["400", "700"], recommendedFor: ["display"] },
  mali: { key: "mali", family: "Mali", category: "handwriting", mood: ["cute", "handwritten"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["display"] },
  itim: { key: "itim", family: "Itim", category: "handwriting", mood: ["fun", "casual"], weights: ["400"], recommendedFor: ["display"] },
  pattaya: { key: "pattaya", family: "Pattaya", category: "handwriting", mood: ["brush", "energetic"], weights: ["400"], recommendedFor: ["display"] },
  krub: { key: "krub", family: "Krub", category: "sans", mood: ["clean", "compact"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["body"] },
  kodchasan: { key: "kodchasan", family: "Kodchasan", category: "sans", mood: ["tech", "rounded"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["heading", "body"] },
  koho: { key: "koho", family: "KoHo", category: "sans", mood: ["playful", "rounded"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["heading", "body"] },
  fahkwang: { key: "fahkwang", family: "Fahkwang", category: "sans", mood: ["wide", "fashion"], weights: ["300", "400", "500", "600", "700"], recommendedFor: ["heading", "display"] },
  thasadith: { key: "thasadith", family: "Thasadith", category: "sans", mood: ["display", "quirky"], weights: ["400", "700"], recommendedFor: ["display"] },
};

export type FontKey = keyof typeof FONTS;

export function fontVar(key: string): string {
  return `var(--font-${key})`;
}

export function fontStack(key: string): string {
  const f = FONTS[key];
  const generic = f?.category === "serif" ? "serif" : f?.category === "mono" ? "monospace" : "sans-serif";
  return `${fontVar(f?.key ?? "prompt")}, ${f?.family ? `"${f.family}", ` : ""}system-ui, ${generic}`;
}
