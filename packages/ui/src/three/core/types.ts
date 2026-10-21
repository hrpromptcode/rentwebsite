/** Shared, serialisable prop types of the 3D kit (safe to import from server components). */

/** Theme colour tokens (CSS custom properties on <html>, e.g. `--primary`). */
export type ThemeToken = "primary" | "accent" | "glow" | "foreground" | "background" | "surface" | "muted" | "ring" | "card" | "border";

/** A theme token name or any CSS colour (`#ff6b3d`, `oklch(…)`, `var(--x)`, `color-mix(…)`). */
export type TokenOrColor = ThemeToken | (string & {});

export type SceneQuality = "auto" | "high" | "low";
export type CapabilityTier = "high" | "mid" | "low";

/** html[data-scene3d] (theme effects.scene3d): auto = full scenes, lite = shader backdrops only, off = posters only. */
export type Scene3dMode = "auto" | "lite" | "off";

export type PosterVariant = "aurora" | "silk" | "mesh" | "ocean" | "stage" | "ember" | "orb" | "grid" | "plain";

export const THEME_TOKENS: readonly ThemeToken[] = ["primary", "accent", "glow", "foreground", "background", "surface", "muted", "ring", "card", "border"];

export function isThemeToken(v: string): v is ThemeToken {
  return (THEME_TOKENS as readonly string[]).includes(v);
}

/** CSS expression for a token-or-colour (server-safe, used by posters / DOM fallbacks). */
export function cssColor(v: TokenOrColor): string {
  return isThemeToken(v) ? `var(--${v})` : v;
}
