import { formatHex, oklch, parse, wcagContrast, type Oklch } from "culori";

export function toOklch(color: string): Oklch | null {
  const parsed = parse(color);
  if (!parsed) return null;
  return oklch(parsed) ?? null;
}

export function hex(color: string | Oklch | undefined): string {
  if (!color) return "#000000";
  if (typeof color === "string") {
    const p = parse(color);
    return p ? (formatHex(p) ?? "#000000") : "#000000";
  }
  return formatHex(color) ?? "#000000";
}

export function contrast(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 1;
  return wcagContrast(pa, pb);
}

/** Returns black or white, whichever reads better on `bg`. */
export function foregroundFor(bg: string, light = "#FFFFFF", dark = "#0A0A0A"): string {
  return contrast(bg, dark) >= contrast(bg, light) ? dark : light;
}

/** Lighten (+) or darken (−) in OKLCH space; amount in [−1, 1]. */
export function shift(color: string, amount: number): string {
  const c = toOklch(color);
  if (!c) return color;
  const l = Math.min(1, Math.max(0, c.l + amount));
  return hex({ ...c, l });
}

export function withAlpha(color: string, alpha: number): string {
  const c = parse(color);
  if (!c) return color;
  const o = oklch(c);
  if (!o) return color;
  const l = (o.l * 100).toFixed(2);
  const ch = (o.c ?? 0).toFixed(4);
  const h = (o.h ?? 0).toFixed(2);
  return `oklch(${l}% ${ch} ${h} / ${alpha})`;
}

export function isDark(color: string): boolean {
  const c = toOklch(color);
  return c ? c.l < 0.5 : false;
}

export function aaOk(fg: string, bg: string, large = false): boolean {
  return contrast(fg, bg) >= (large ? 3 : 4.5);
}
