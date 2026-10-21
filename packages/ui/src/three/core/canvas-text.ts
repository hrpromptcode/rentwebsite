/**
 * 2D-canvas helpers for 3D scenes (no three.js here; impl code wraps the canvases in CanvasTexture).
 * The browser shapes Thai correctly on canvas, so Thai titles/labels are fine as long as the font is loaded.
 * Client-only: call from effects.
 */
import { mulberry32, seedFromString } from "./random";

/** Resolve a CSS font-family expression (e.g. the theme's `--font-display`) on an element. */
export function resolveFontFamily(cssVar = "--font-display", scope?: Element | null): string {
  if (typeof document === "undefined") return "sans-serif";
  const el = (scope as HTMLElement | null) ?? document.body;
  const raw = getComputedStyle(el).getPropertyValue(cssVar).trim();
  if (raw && !raw.includes("var(")) return raw;
  // resolve nested var() through a probe
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;font-family:var(${cssVar}, sans-serif)`;
  el.appendChild(probe);
  const fam = getComputedStyle(probe).fontFamily || "sans-serif";
  probe.remove();
  return fam;
}

/** Wait (bounded) for a CSS font shorthand to be available, so canvas text does not draw in a fallback face. */
export async function ensureFont(font: string, sample = "Aกข", timeoutMs = 2500): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.race([document.fonts.load(font, sample), new Promise((r) => setTimeout(r, timeoutMs))]);
  } catch {
    /* ignore */
  }
}

export interface TextTextureOptions {
  width?: number;
  height?: number;
  /** CSS font shorthand; default `600 64px <theme display font>` */
  font?: string;
  color?: string;
  background?: string;
  align?: CanvasTextAlign;
  /** line height multiplier (Thai needs ≥ 1.25) */
  lineHeight?: number;
  padding?: number;
  /** wrap to max width (px) */
  maxWidth?: number;
}

/** Wrap text to lines that fit `maxWidth` (Thai has no spaces: falls back to Intl.Segmenter words, then graphemes). */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let tokens: string[];
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const seg = new Intl.Segmenter("th", { granularity: "word" });
      tokens = Array.from(seg.segment(para), (s) => s.segment);
    } else tokens = para.split(/(\s+)/);
    let line = "";
    for (const tok of tokens) {
      const test = line + tok;
      if (ctx.measureText(test).width > maxWidth && line.trim()) {
        out.push(line.trimEnd());
        line = tok.trimStart();
      } else line = test;
    }
    if (line.trim()) out.push(line.trimEnd());
  }
  return out;
}

/** Draw (wrapped) text on a fresh canvas. Await `ensureFont` first for webfonts. */
export function drawTextTexture(text: string, opts: TextTextureOptions = {}): HTMLCanvasElement {
  const { width = 1024, height = 256, color = "#ffffff", background, align = "left", lineHeight = 1.3, padding = 32 } = opts;
  const font = opts.font ?? `600 64px ${resolveFontFamily()}`;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "64");
  const lines = wrapText(ctx, text, opts.maxWidth ?? width - padding * 2);
  const lh = size * lineHeight;
  const x = align === "center" ? width / 2 : align === "right" ? width - padding : padding;
  let y = padding + size;
  for (const l of lines) {
    ctx.fillText(l, x, y);
    y += lh;
  }
  return c;
}

function samplePixels(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, seed: string, test: (r: number, g: number, b: number, a: number) => number) {
  const data = ctx.getImageData(0, 0, w, h).data;
  const candidates: number[] = [];
  const weights: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const wgt = test(data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!);
      if (wgt > 0) {
        candidates.push(x, y);
        weights.push(wgt);
      }
    }
  }
  const rnd = mulberry32(seedFromString(seed));
  const out = new Float32Array(count * 3);
  const n = weights.length;
  if (!n) return out;
  const aspect = w / h;
  for (let k = 0; k < count; k++) {
    const j = Math.floor(rnd() * n);
    const px = candidates[j * 2]! + rnd() - 0.5;
    const py = candidates[j * 2 + 1]! + rnd() - 0.5;
    out[k * 3] = (px / w - 0.5) * 2 * (aspect >= 1 ? 1 : aspect);
    out[k * 3 + 1] = -(py / h - 0.5) * 2 * (aspect >= 1 ? 1 / aspect : 1);
    out[k * 3 + 2] = weights[j]!;
  }
  return out;
}

export interface SampleOptions {
  /** canvas resolution used for sampling (longest side) */
  resolution?: number;
  /** z thickness: points get z ∈ [-depth/2, depth/2] (images: by luminance) */
  depth?: number;
  seed?: string;
}

function finishDepth(out: Float32Array, depth: number, seed: string, fromWeight: boolean) {
  const rnd = mulberry32(seedFromString(seed + ":z"));
  for (let i = 2; i < out.length; i += 3) out[i] = fromWeight ? (out[i]! - 0.5) * depth : (rnd() - 0.5) * depth;
  return out;
}

/** Sample `count` points (xyz, normalised to the [-1,1] box, aspect kept) from rendered text. */
export async function sampleTextPoints(text: string, count: number, opts: SampleOptions & { font?: string; weight?: number } = {}): Promise<Float32Array> {
  const res = opts.resolution ?? 512;
  const family = opts.font ?? resolveFontFamily();
  const weight = opts.weight ?? 700;
  const size = Math.round(res * 0.32);
  const font = `${weight} ${size}px ${family}`;
  await ensureFont(font, text);
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const lines = text.split("\n");
  const wMax = Math.max(...lines.map((l) => probe.measureText(l).width));
  const w = Math.ceil(Math.min(res * 2, wMax + size * 0.4));
  const lh = size * 1.3;
  const h = Math.ceil(lh * lines.length + size * 0.4);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.font = font;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, w / 2, size * 0.2 + lh * (i + 0.5)));
  const out = samplePixels(ctx, w, h, count, opts.seed ?? text, (_r, _g, _b, a) => (a > 128 ? 1 : 0));
  return finishDepth(out, opts.depth ?? 0.12, opts.seed ?? text, false);
}

/** Sample points from an SVG path `d` (e.g. a lucide icon path; viewBox default "0 0 24 24"). Filled + stroked. */
export function sampleSvgPathPoints(d: string, count: number, opts: SampleOptions & { viewBox?: string; stroke?: number; fill?: boolean } = {}): Float32Array {
  const res = opts.resolution ?? 384;
  const [vx, vy, vw, vh] = (opts.viewBox ?? "0 0 24 24").split(/[\s,]+/).map(Number) as [number, number, number, number];
  const scale = res / Math.max(vw, vh);
  const w = Math.ceil(vw * scale);
  const h = Math.ceil(vh * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.setTransform(scale, 0, 0, scale, -vx * scale, -vy * scale);
  const path = new Path2D(d);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = opts.stroke ?? 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (opts.fill) ctx.fill(path);
  ctx.stroke(path);
  const out = samplePixels(ctx, w, h, count, opts.seed ?? d.slice(0, 40), (_r, _g, _b, a) => (a > 100 ? 1 : 0));
  return finishDepth(out, opts.depth ?? 0.1, opts.seed ?? d.slice(0, 40), false);
}

/** Sample points from an image by luminance (> threshold); z follows luminance. Needs CORS-enabled images. */
export async function sampleImagePoints(src: string, count: number, opts: SampleOptions & { threshold?: number } = {}): Promise<Float32Array> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.src = src;
  await img.decode();
  const res = opts.resolution ?? 256;
  const s = res / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(img.naturalHeight * s));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const th = opts.threshold ?? 0.35;
  const out = samplePixels(ctx, w, h, count, opts.seed ?? src, (r, g, b, a) => {
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return a > 10 && l > th ? l : 0;
  });
  return finishDepth(out, opts.depth ?? 0.5, opts.seed ?? src, true);
}
