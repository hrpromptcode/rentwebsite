import { describe, expect, it } from "vitest";
import { escapeStyleText, resolveTheme, sanitizeCss, themeToCss } from "../src/theme";

/** True when the text, placed inside <style>…</style>, would let the HTML parser leave the element. */
const breaksOutOfStyle = (css: string) => /<\/style/i.test(css);

describe("sanitizeCss (SEC-001 / SEC-001b)", () => {
  const payloads = [
    "</sty</style>le><script>alert(document.domain)</script>",
    "</STYLE><script>alert(1)</script>",
    "</style ><img src=x onerror=alert(1)>",
    "</style/><svg onload=alert(1)>",
    "<</style>/style><script>alert(1)</script>",
    "a{}</style\n><script>alert(1)</script>",
    "</sty<style>le><script>alert(1)</script>",
  ];

  it.each(payloads)("never lets custom css close the <style> element: %s", (payload) => {
    const out = sanitizeCss(payload);
    expect(breaksOutOfStyle(out)).toBe(false);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<(img|svg)/i);
    const tag = themeToCss(resolveTheme({ preset: "quartz", customCss: payload })).styleTag;
    expect(breaksOutOfStyle(tag)).toBe(false);
    expect(tag).not.toMatch(/<[a-z/!]/i);
  });

  it("removes nested and escaped @import", () => {
    for (const css of [
      "@im@import x;port url(https://evil.example/x.css);",
      "@import url(https://evil.example/x.css);",
      "@IMPORT 'https://evil.example/x.css';",
      "@\\69mport url(https://evil.example/x.css);",
      "@\\69 mport url(https://evil.example/x.css);",
      "@i\\mport url(https://evil.example/x.css);",
      "@media screen{a{color:red}} @import url(https://evil.example/x.css);",
      "@import url(https://evil.example/x.css)",
    ]) {
      const out = sanitizeCss(css);
      expect(out, css).not.toContain("evil.example");
      expect(out.toLowerCase(), css).not.toContain("@import");
    }
  });

  it("keeps ordinary css working", () => {
    const css = [
      ".hero h1{letter-spacing:-0.04em}",
      "@media (width < 600px){.a{display:none}}",
      "@media (min-width: 768px){.b{scroll-behavior:smooth;transition-behavior:allow-discrete}}",
      ".c{background:url(https://cdn.example.com/a.png)}",
      ".d{background:url('/uploads/x.png')}",
      '.e::before{content:"\\201C"}',
      "@font-face{font-family:X;src:url(https://fonts.example.com/x.woff2)}",
    ].join("\n");
    expect(sanitizeCss(css)).toBe(css);
  });

  it("escapes a tag-like < as the CSS escape \\3c (same glyph inside strings)", () => {
    expect(escapeStyleText('.x::after{content:"</b>"}')).toBe('.x::after{content:"\\3c /b>"}');
    expect(escapeStyleText("@media (400px <= width <= 700px){}")).toBe("@media (400px <= width <= 700px){}");
  });

  it("still neutralises javascript:, expression() and relative/data urls", () => {
    const out = sanitizeCss(".a{background:url(javascript:alert(1))} .b{width:expression(alert(1))} .c{background:url(data:text/html,x)} .d{-moz-binding:url(https://x/y.xml#z)}");
    expect(out).not.toContain("javascript:");
    expect(out).not.toMatch(/expression\s*\(/i);
    expect(out).not.toContain("data:text/html");
    expect(out).not.toMatch(/-moz-binding\s*:/i);
  });
});
