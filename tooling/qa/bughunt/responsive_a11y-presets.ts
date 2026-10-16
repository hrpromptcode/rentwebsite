import { PRESETS, getPreset } from "@rentweb/core/theme";
import { contrast } from "../../../packages/core/src/theme/color";
/** responsive_a11y: WCAG contrast of every preset default palette. */
for (const key of ["aurora", "candy", "zen", "porcelain", "ember", "quartz", "midnight", "studio"]) {
  const p = getPreset(key);
  for (const [mode, c] of [["light", p.light], ["dark", p.dark]] as const) {
    const pairs = { "primaryFg/primary": [c.primaryForeground, c.primary], "primary/bg": [c.primary, c.background], "muted/bg": [c.mutedForeground, c.background], "muted/muted": [c.mutedForeground, c.muted], "accentFg/accent": [c.accentForeground, c.accent], "destructive/bg": [c.destructive, c.background] } as Record<string, [string, string]>;
    console.log(key.padEnd(10), mode.padEnd(5), Object.entries(pairs).map(([k, [a, b]]) => `${k}=${contrast(a, b).toFixed(2)}${contrast(a, b) < 4.5 ? "!" : ""}(${a}/${b})`).join(" "));
  }
}
void PRESETS;
