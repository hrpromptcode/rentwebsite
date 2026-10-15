import { z } from "zod";

const color = z.string().min(3).max(64);

export const paletteSchema = z
  .object({
    background: color,
    foreground: color,
    card: color,
    cardForeground: color,
    popover: color,
    popoverForeground: color,
    primary: color,
    primaryForeground: color,
    secondary: color,
    secondaryForeground: color,
    muted: color,
    mutedForeground: color,
    accent: color,
    accentForeground: color,
    destructive: color,
    destructiveForeground: color,
    border: color,
    input: color,
    ring: color,
    /** large decorative surfaces (hero gradients, glows) */
    glow: color,
    surface: color,
  })
  .partial();

export type Palette = z.infer<typeof paletteSchema>;
export type FullPalette = Required<Palette>;

export const HEADER_LAYOUTS = ["classic", "centered", "split", "floating", "minimal", "sidebar"] as const;
export const FOOTER_LAYOUTS = ["columns", "simple", "big", "centered"] as const;
export const BUTTON_STYLES = ["rounded", "pill", "sharp", "soft", "brutal"] as const;
export const CARD_STYLES = ["flat", "elevated", "outlined", "glass", "brutal", "soft"] as const;
export const HERO_BACKGROUNDS = ["none", "gradient-mesh", "aurora", "particles", "orb-3d", "grid", "noise", "blobs", "waves", "spotlight"] as const;
export const MOTION_LEVELS = ["subtle", "standard", "expressive"] as const;
export const RADII = ["none", "sm", "md", "lg", "xl", "2xl", "full"] as const;
export const DENSITIES = ["compact", "comfortable", "spacious"] as const;

export const layoutSchema = z
  .object({
    header: z.enum(HEADER_LAYOUTS),
    footer: z.enum(FOOTER_LAYOUTS),
    buttonStyle: z.enum(BUTTON_STYLES),
    cardStyle: z.enum(CARD_STYLES),
    containerWidth: z.enum(["narrow", "normal", "wide", "full"]),
    headerSticky: z.boolean(),
    headerTransparent: z.boolean(),
  })
  .partial();

export const effectsSchema = z
  .object({
    heroBackground: z.enum(HERO_BACKGROUNDS),
    grain: z.boolean(),
    cursorGlow: z.boolean(),
    pageTransitions: z.boolean(),
    motionLevel: z.enum(MOTION_LEVELS),
    textReveal: z.boolean(),
    marquee: z.boolean(),
    glassmorphism: z.boolean(),
    scanlines: z.boolean(),
  })
  .partial();

export const brandSchema = z
  .object({
    logo: z.string().nullable(),
    logoDark: z.string().nullable(),
    favicon: z.string().nullable(),
    ogImage: z.string().nullable(),
    logoText: z.string().max(60).nullable(),
    showName: z.boolean(),
    tagline: z.string().max(140).nullable(),
  })
  .partial();

export const themeSchema = z.object({
  preset: z.string().default("aurora"),
  mode: z.enum(["light", "dark", "system"]).optional(),
  colors: paletteSchema.default({}),
  darkColors: paletteSchema.default({}),
  fonts: z.object({ heading: z.string(), body: z.string(), display: z.string() }).partial().default({}),
  radius: z.enum(RADII).optional(),
  density: z.enum(DENSITIES).optional(),
  layout: layoutSchema.default({}),
  effects: effectsSchema.default({}),
  brand: brandSchema.default({}),
  customCss: z.string().max(20_000).nullable().default(null),
});

export type ThemeInput = z.input<typeof themeSchema>;
export type ThemeStored = z.output<typeof themeSchema>;
export type ThemeLayout = Required<z.infer<typeof layoutSchema>>;
export type ThemeEffects = Required<z.infer<typeof effectsSchema>>;
export type ThemeBrand = z.infer<typeof brandSchema>;

export function parseTheme(input: unknown): ThemeStored {
  const r = themeSchema.safeParse(input ?? {});
  return r.success ? r.data : themeSchema.parse({});
}
