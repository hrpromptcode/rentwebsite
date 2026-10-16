import { FONTS, fontStack } from "./fonts";
import { getPreset, type ThemePreset } from "./presets";
import { parseTheme, type FullPalette, type ThemeBrand, type ThemeEffects, type ThemeLayout, type ThemeStored } from "./schema";
import { aaOk, foregroundFor, hex, shift, withAlpha } from "./color";

export interface ResolvedTheme {
  preset: ThemePreset;
  mode: "light" | "dark" | "system";
  light: FullPalette;
  dark: FullPalette;
  fonts: { heading: string; body: string; display: string };
  radius: ThemePreset["radius"];
  density: ThemePreset["density"];
  layout: ThemeLayout;
  effects: ThemeEffects;
  brand: ThemeBrand;
  customCss: string | null;
  /** accessibility warnings produced while resolving (shown in admin) */
  warnings: string[];
}

const RADIUS_PX: Record<ThemePreset["radius"], string> = {
  none: "0px",
  sm: "0.25rem",
  md: "0.5rem",
  lg: "0.75rem",
  xl: "1rem",
  "2xl": "1.5rem",
  full: "9999px",
};

const DENSITY_SCALE: Record<ThemePreset["density"], string> = {
  compact: "0.85",
  comfortable: "1",
  spacious: "1.2",
};

/** Fill derived colors: foregrounds that are missing get auto-contrast, ring defaults to primary… */
function completePalette(base: FullPalette, overrides: Partial<FullPalette>, warnings: string[], label: string): FullPalette {
  const p: FullPalette = { ...base, ...stripUndefined(overrides) };
  // If the user changed primary but not its foreground, pick a readable one
  if (overrides.primary && !overrides.primaryForeground) p.primaryForeground = foregroundFor(p.primary);
  if (overrides.accent && !overrides.accentForeground) p.accentForeground = foregroundFor(p.accent);
  if (overrides.secondary && !overrides.secondaryForeground) p.secondaryForeground = foregroundFor(p.secondary);
  if (overrides.background && !overrides.foreground) p.foreground = foregroundFor(p.background);
  if (overrides.card && !overrides.cardForeground) p.cardForeground = foregroundFor(p.card);
  if (overrides.primary && !overrides.ring) p.ring = p.primary;
  if (overrides.primary && !overrides.glow) p.glow = shift(p.primary, 0.25);

  for (const [k, v] of Object.entries(p)) p[k as keyof FullPalette] = hex(v);

  if (!aaOk(p.foreground, p.background)) warnings.push(`${label}: ข้อความหลักกับพื้นหลังคอนทราสต์ต่ำกว่า 4.5:1`);
  if (!aaOk(p.primaryForeground, p.primary)) warnings.push(`${label}: ข้อความบนปุ่มหลักอ่านยาก (คอนทราสต์ต่ำ)`);
  // the primary colour is also used as text (prices, eyebrows, links) on the page background
  if (!aaOk(p.primary, p.background)) warnings.push(`${label}: สีหลักใช้เป็นตัวอักษรบนพื้นหลังแล้วอ่านยาก (ต่ำกว่า 4.5:1)`);
  if (!aaOk(p.accentForeground, p.accent)) warnings.push(`${label}: ข้อความบนสีเน้น (accent) อ่านยาก`);
  // muted text is body-sized (12–16px), so it needs the full 4.5:1, not the large-text 3:1
  if (!aaOk(p.mutedForeground, p.background) || !aaOk(p.mutedForeground, p.muted)) warnings.push(`${label}: ข้อความรอง (muted) จางเกินไป`);
  return p;
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")) as T;
}

export function resolveTheme(input: unknown): ResolvedTheme {
  const stored: ThemeStored = parseTheme(input);
  const preset = getPreset(stored.preset);
  const warnings: string[] = [];

  const light = completePalette(preset.light, stored.colors as Partial<FullPalette>, warnings, "โหมดสว่าง");
  const dark = completePalette(preset.dark, stored.darkColors as Partial<FullPalette>, warnings, "โหมดมืด");

  const fonts = {
    heading: FONTS[stored.fonts.heading ?? ""] ? stored.fonts.heading! : preset.fonts.heading,
    body: FONTS[stored.fonts.body ?? ""] ? stored.fonts.body! : preset.fonts.body,
    display: FONTS[stored.fonts.display ?? ""] ? stored.fonts.display! : (preset.fonts.display ?? preset.fonts.heading),
  };

  return {
    preset,
    mode: stored.mode ?? preset.defaultMode,
    light,
    dark,
    fonts,
    radius: stored.radius ?? preset.radius,
    density: stored.density ?? preset.density,
    layout: { ...preset.layout, ...stripUndefined(stored.layout) },
    effects: { ...preset.effects, ...stripUndefined(stored.effects) },
    brand: stored.brand,
    customCss: stored.customCss,
    warnings,
  };
}

function paletteVars(p: FullPalette): Record<string, string> {
  return {
    "--background": p.background,
    "--foreground": p.foreground,
    "--card": p.card,
    "--card-foreground": p.cardForeground,
    "--popover": p.popover,
    "--popover-foreground": p.popoverForeground,
    "--primary": p.primary,
    "--primary-foreground": p.primaryForeground,
    "--primary-hover": shift(p.primary, -0.06),
    "--primary-soft": withAlpha(p.primary, 0.12),
    "--secondary": p.secondary,
    "--secondary-foreground": p.secondaryForeground,
    "--muted": p.muted,
    "--muted-foreground": p.mutedForeground,
    "--accent": p.accent,
    "--accent-foreground": p.accentForeground,
    "--accent-soft": withAlpha(p.accent, 0.14),
    "--destructive": p.destructive,
    "--destructive-foreground": p.destructiveForeground,
    "--border": p.border,
    "--input": p.input,
    "--ring": p.ring,
    "--glow": p.glow,
    "--surface": p.surface,
  };
}

export interface ThemeCss {
  /** inline style for <html> in light mode */
  lightVars: Record<string, string>;
  darkVars: Record<string, string>;
  /** non-color vars (fonts, radius, density, motion) */
  sharedVars: Record<string, string>;
  /** full <style> text with :root / .dark blocks + custom css */
  styleTag: string;
  /** class names to apply on <html> */
  htmlClass: string;
  /** data attributes describing layout/effects for CSS hooks */
  dataAttrs: Record<string, string>;
}

export function themeToCss(t: ResolvedTheme): ThemeCss {
  const lightVars = paletteVars(t.light);
  const darkVars = paletteVars(t.dark);
  const sharedVars: Record<string, string> = {
    "--font-heading": fontStack(t.fonts.heading),
    "--font-body": fontStack(t.fonts.body),
    "--font-display": fontStack(t.fonts.display),
    "--radius": RADIUS_PX[t.radius],
    "--density": DENSITY_SCALE[t.density],
    "--ease-theme": t.preset.motion.ease,
    "--dur-fast": `${t.preset.motion.durationFast}ms`,
    "--dur-base": `${t.preset.motion.durationBase}ms`,
    "--dur-slow": `${t.preset.motion.durationSlow}ms`,
  };

  const block = (sel: string, vars: Record<string, string>) =>
    `${sel}{${Object.entries(vars)
      .map(([k, v]) => `${k}:${v}`)
      .join(";")}}`;

  const parts = [block(":root", { ...sharedVars, ...lightVars }), block(".dark", darkVars)];
  if (t.mode === "system") {
    parts.push(`@media (prefers-color-scheme: dark){:root:not(.light){${Object.entries(darkVars)
      .map(([k, v]) => `${k}:${v}`)
      .join(";")}}}`);
  }
  if (t.customCss) parts.push(sanitizeCss(t.customCss));

  const classes = [t.mode === "dark" ? "dark" : t.mode === "light" ? "light" : "", `preset-${t.preset.key}`];

  return {
    lightVars,
    darkVars,
    sharedVars,
    // escape once more over the whole tag: nothing in it may close the <style> element
    styleTag: escapeStyleText(parts.join("\n")),
    htmlClass: classes.filter(Boolean).join(" "),
    dataAttrs: {
      "data-preset": t.preset.key,
      "data-header": t.layout.header,
      "data-footer": t.layout.footer,
      "data-button": t.layout.buttonStyle,
      "data-card": t.layout.cardStyle,
      "data-container": t.layout.containerWidth,
      "data-motion": t.effects.motionLevel,
      "data-hero-bg": t.effects.heroBackground,
      "data-grain": String(t.effects.grain),
      "data-glass": String(t.effects.glassmorphism),
    },
  };
}

const MAX_CUSTOM_CSS = 20_000;

/** Decode CSS escapes inside an identifier, e.g. `\69 mport` -> `import`. */
function decodeCssIdent(raw: string): string {
  return raw.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([\s\S])/g, (_m, hexDigits: string | undefined, ch: string | undefined) => {
    if (hexDigits === undefined) return ch ?? "";
    const cp = parseInt(hexDigits, 16);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : String.fromCharCode(0xfffd);
  });
}

/** Removes every @import statement, including escaped spellings such as `@\69mport`. */
function stripImports(css: string): string {
  const atKeyword = /@((?:[\w-]|\\[0-9a-fA-F]{1,6}\s?|\\[^\r\n\f0-9a-fA-F])+)/g;
  let out = "";
  let last = 0;
  for (let m = atKeyword.exec(css); m; m = atKeyword.exec(css)) {
    if (decodeCssIdent(m[1]!).toLowerCase() !== "import") continue;
    const semi = css.indexOf(";", atKeyword.lastIndex);
    const stop = semi === -1 ? css.length : semi + 1;
    out += css.slice(last, m.index);
    last = stop;
    atKeyword.lastIndex = stop;
  }
  return out + css.slice(last);
}

function sanitizeOnce(css: string): string {
  return stripImports(css)
    .replace(/<\/?style[^>]*>/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/-moz-binding\s*:/gi, "")
    .replace(/(?<![\w-])behavior\s*:/gi, "") // IE behaviours; keeps scroll-behavior etc.
    // only absolute http(s) and site-relative urls; the quote is excluded from the lookahead so
    // backtracking over an optional quote cannot drop url('/uploads/x.png')
    .replace(/url\(\s*['"]?\s*(?!['"]|https?:\/\/|\/)[^)]*\)/gi, "url()");
}

/**
 * Makes text safe to place inside an HTML <style> element. The HTML tokenizer ends the element at
 * the raw characters `</style` whatever CSS thinks, so every `<` that could start a tag is written
 * as the CSS escape `\3c ` (the same character for CSS inside strings, inert outside them). A `<`
 * followed by whitespace, `=` or a digit (media-query ranges such as `(width < 600px)`) is kept.
 */
export function escapeStyleText(css: string): string {
  return css.replace(/<(?![\s=0-9])/g, "\\3c ");
}

/**
 * Conservative CSS sanitizer for tenant custom CSS (Business plan). The replacements run until the
 * output is stable, so nested payloads like `</sty</style>le>` or `@im@import x;port` cannot
 * reassemble, and the result can never close the surrounding <style> element (SEC-001).
 */
export function sanitizeCss(css: string): string {
  let out = css.slice(0, MAX_CUSTOM_CSS);
  for (let i = 0; i < 20; i++) {
    const next = sanitizeOnce(out);
    if (next === out) return escapeStyleText(out);
    out = next;
  }
  return ""; // still changing after 20 passes: refuse rather than guess
}
