import { describe, expect, it } from "vitest";
import { PRESETS, contrast, resolveTheme, type FullPalette } from "../src/theme";

/** Text/background pairs that render as normal-size text on the storefront (RA-08). */
const PAIRS: Array<[keyof FullPalette, keyof FullPalette, string]> = [
  ["foreground", "background", "body text"],
  ["cardForeground", "card", "card text"],
  ["primaryForeground", "primary", "primary button label"],
  ["primary", "background", "text-primary on page (prices, eyebrows)"],
  ["primary", "card", "text-primary on cards"],
  ["mutedForeground", "background", "muted text"],
  ["mutedForeground", "muted", "muted text on muted surface"],
  ["mutedForeground", "card", "muted text on cards"],
  ["accentForeground", "accent", "accent badge label"],
  ["secondaryForeground", "secondary", "secondary button label"],
  ["destructive", "background", "form error text"],
  ["destructive", "card", "form error text on cards"],
  ["destructiveForeground", "destructive", "destructive button label"],
];

describe("shipped theme presets meet WCAG AA 4.5:1 (RA-08)", () => {
  for (const [key, preset] of Object.entries(PRESETS)) {
    for (const mode of ["light", "dark"] as const) {
      it(`${key} ${mode}`, () => {
        const pal = preset[mode];
        const failures = PAIRS.filter(([fg, bg]) => contrast(pal[fg], pal[bg]) < 4.5).map(
          ([fg, bg, what]) => `${what}: ${fg} ${pal[fg]} on ${bg} ${pal[bg]} = ${contrast(pal[fg], pal[bg]).toFixed(2)}`,
        );
        expect(failures).toEqual([]);
      });
    }
  }

  it("resolveTheme raises no contrast warnings for any untouched preset", () => {
    for (const key of Object.keys(PRESETS)) expect(resolveTheme({ preset: key }).warnings, key).toEqual([]);
  });

  it("still warns when an owner picks unreadable colours", () => {
    const w = resolveTheme({ preset: "quartz", colors: { primary: "#FFE066", primaryForeground: "#FFFFFF", mutedForeground: "#B0B0B0" } }).warnings;
    expect(w.some((x) => x.includes("ปุ่มหลัก"))).toBe(true);
    expect(w.some((x) => x.includes("สีหลัก"))).toBe(true);
    expect(w.some((x) => x.includes("muted"))).toBe(true);
  });
});
