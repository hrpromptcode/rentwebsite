import { describe, expect, it } from "vitest";
import { resolveTheme, themeToCss, PRESETS, parseTheme } from "../src/theme";
import { contrast, foregroundFor } from "../src/theme/color";

describe("theme engine", () => {
  it("falls back to the aurora preset for unknown presets", () => {
    const t = resolveTheme({ preset: "does-not-exist" });
    expect(t.preset.key).toBe("aurora");
    expect(t.light.primary.toLowerCase()).toBe(PRESETS.aurora!.light.primary.toLowerCase());
  });

  it("applies color overrides and derives a readable foreground", () => {
    const t = resolveTheme({ preset: "quartz", colors: { primary: "#111111" } });
    expect(t.light.primary.toLowerCase()).toBe("#111111");
    expect(t.light.primaryForeground.toLowerCase()).toBe("#ffffff");
    expect(t.light.ring.toLowerCase()).toBe("#111111");
  });

  it("warns about low-contrast combinations", () => {
    const t = resolveTheme({ preset: "quartz", colors: { background: "#ffffff", foreground: "#fafafa" } });
    expect(t.warnings.length).toBeGreaterThan(0);
  });

  it("every preset passes AA contrast for body text and primary buttons", () => {
    for (const p of Object.values(PRESETS)) {
      for (const mode of ["light", "dark"] as const) {
        const pal = p[mode];
        expect(contrast(pal.foreground, pal.background), `${p.key} ${mode} text`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(pal.primaryForeground, pal.primary), `${p.key} ${mode} button`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("generates css variables and data attributes", () => {
    const css = themeToCss(resolveTheme({ preset: "neon" }));
    expect(css.styleTag).toContain("--primary:");
    expect(css.styleTag).toContain(".dark{");
    expect(css.htmlClass).toContain("dark");
    expect(css.dataAttrs["data-button"]).toBe("sharp");
    expect(css.sharedVars["--font-heading"]).toContain("var(--font-chakra-petch)");
  });

  it("strips dangerous custom css", () => {
    const css = themeToCss(resolveTheme({ preset: "quartz", customCss: "@import url(x); .a{background:url(javascript:alert(1))} .b{color:red}" }));
    expect(css.styleTag).not.toContain("@import");
    expect(css.styleTag).not.toContain("javascript:");
    expect(css.styleTag).toContain(".b{color:red}");
  });

  it("parseTheme tolerates garbage", () => {
    expect(parseTheme({ preset: 42, colors: "nope" }).preset).toBe("aurora");
    expect(foregroundFor("#000000")).toBe("#FFFFFF");
  });
});
