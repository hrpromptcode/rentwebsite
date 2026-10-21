/**
 * Thai-safe text splitting. PURE + server-safe: call it in server components and pass the parts to client components.
 * Node's and Chrome's ICU dictionaries segment Thai WORDS differently, so word segmentation must happen exactly once
 * (on the server) or hydration mismatches. Grapheme segmentation (UAX #29) is engine-independent but is done on the
 * server as well, so a client never re-segments.
 */

export const THAI_RE = /[฀-๿]/;
const LATIN_RE = /[A-Za-zÀ-ɏ]/;

export type Script = "thai" | "latin" | "mixed";

export function isThai(text: string): boolean {
  return THAI_RE.test(text);
}

/** "thai" (Thai letters, maybe digits/punctuation), "latin" (no Thai) or "mixed" (both Thai and Latin letters). */
export function scriptOf(text: string): Script {
  const th = THAI_RE.test(text);
  if (!th) return "latin";
  return LATIN_RE.test(text) ? "mixed" : "thai";
}

type SegmenterLike = { segment(input: string): Iterable<{ segment: string }> };
function segmenter(granularity: "word" | "grapheme"): SegmenterLike | null {
  try {
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      return new (Intl as unknown as { Segmenter: new (l: string, o: { granularity: string }) => SegmenterLike }).Segmenter("th", { granularity });
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Grapheme clusters: a Thai base consonant always stays with its vowels / tone marks. */
export function graphemes(text: string): string[] {
  const seg = segmenter("grapheme");
  if (seg) return Array.from(seg.segment(text), (s) => s.segment);
  return text.match(/\P{M}\p{M}*/gu) ?? [];
}

export function graphemeCount(text: string): number {
  return graphemes(text).length;
}

/** Back-compat (was in text-reveal.tsx). "words": Intl word segments (spaces kept as their own parts) + ๆ glued. */
export function segmentText(text: string, granularity: "words" | "chars" = "words"): string[] {
  if (granularity === "chars") return graphemes(text);
  const seg = segmenter("word");
  const parts = seg ? Array.from(seg.segment(text), (s) => s.segment) : text.split(/(\s+)/).filter(Boolean);
  return glueMaiYamok(parts);
}

/**
 * Thai typography: the repetition mark ๆ (mai yamok) never starts a line. Glue ๆ, and the space before it as a
 * no-break space, onto the preceding word.
 */
const MAI_YAMOK = String.fromCharCode(0x0e46);
const NBSP = String.fromCharCode(0xa0);
export function glueMaiYamok(parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    if (part.startsWith(MAI_YAMOK) && out.length) {
      const space = /^\s+$/.test(out[out.length - 1]!) ? out.pop()! : "";
      if (out.length) {
        out[out.length - 1] += (space ? NBSP : "") + part;
        continue;
      }
      if (space) out.push(space);
    }
    out.push(part);
  }
  return out;
}

const WS_RE = /^\s+$/;
const WORDLIKE_RE = /[\p{L}\p{N}]/u;
const OPENING_RE = /^[([{“‘"'«‹]+$/u;

/**
 * Word parts for reveals: Intl word segments, whitespace kept as separate parts, ๆ glued, and punctuation glued to its
 * neighbour (closing marks to the previous word, opening marks to the next) so "ร้านค้า," never wraps before the comma.
 */
export function splitWords(text: string): string[] {
  const raw = segmentText(text, "words");
  const out: string[] = [];
  let pendingOpen = "";
  for (const part of raw) {
    if (WS_RE.test(part)) {
      if (pendingOpen) {
        out.push(pendingOpen);
        pendingOpen = "";
      }
      out.push(part);
      continue;
    }
    if (!WORDLIKE_RE.test(part)) {
      if (OPENING_RE.test(part)) {
        pendingOpen += part;
        continue;
      }
      const prev = out[out.length - 1];
      if (prev !== undefined && !WS_RE.test(prev)) {
        out[out.length - 1] = prev + pendingOpen + part;
        pendingOpen = "";
        continue;
      }
    }
    out.push(pendingOpen + part);
    pendingOpen = "";
  }
  if (pendingOpen) out.push(pendingOpen);
  return out;
}

/**
 * Grapheme parts for per-letter effects. Thai strings longer than `maxThai` graphemes (default 12) fall back to word
 * parts: per-letter motion on long Thai text reads as noise and fights the reading flow.
 */
export function splitGraphemes(text: string, maxThai = 12): string[] {
  if (isThai(text) && graphemeCount(text.replace(/\s+/g, "")) > maxThai) return splitWords(text);
  return graphemes(text);
}

/** One renderable token: whitespace, or a word (optionally with its grapheme parts for "chars" mode). */
export interface SplitToken {
  /** the text of the token */
  t: string;
  /** whitespace token */
  ws?: 1;
  /** grapheme parts (chars mode only) */
  c?: string[];
}

/**
 * Tokens for SplitReveal / LetterDrop / RollText. Words never break inside (each word is one nowrap box); in chars mode
 * each word also carries its graphemes. Thai words are only split into graphemes when the whole Thai text is ≤ maxThai
 * graphemes, otherwise they animate as whole words.
 */
export function tokenize(text: string, opts: { chars?: boolean; maxThai?: number } = {}): SplitToken[] {
  const words = splitWords(text);
  const thaiTooLong = isThai(text) && graphemeCount(text.replace(/\s+/g, "")) > (opts.maxThai ?? 12);
  return words.map((w) => {
    if (WS_RE.test(w)) return { t: w, ws: 1 as const };
    if (!opts.chars) return { t: w };
    if (thaiTooLong && isThai(w)) return { t: w };
    return { t: w, c: graphemes(w) };
  });
}

/**
 * Rough advance width of a string in em (for fit-to-width display type without measuring on the server). Tuned for
 * grotesk / Thai display faces; GiantWordmark refines it with one client measurement.
 */
export function estimateEm(text: string): number {
  let em = 0;
  for (const g of graphemes(text)) {
    const ch = g.charAt(0);
    if (/\s/.test(ch)) em += 0.28;
    else if (THAI_RE.test(ch)) em += /[ะ-ฺ็-๎]/.test(ch) ? 0 : 0.6;
    else if (/[A-Z0-9]/.test(ch)) em += /[MW]/.test(ch) ? 0.86 : /[I1]/.test(ch) ? 0.32 : 0.66;
    else if (/[a-z]/.test(ch)) em += /[mw]/.test(ch) ? 0.8 : /[ijlft]/.test(ch) ? 0.3 : 0.54;
    else em += 0.36;
  }
  return Math.max(em, 0.5);
}
