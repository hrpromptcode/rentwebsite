import "../../load-env";
import { getDb, inArray, tenants, withPlatform } from "@rentweb/db";
import { resolveTheme } from "@rentweb/core/theme";
import { contrast } from "../../../packages/core/src/theme/color";

/** responsive_a11y bughunt: contrast of resolved palettes for the demo tenants (light + dark). */
const SLUGS = ["demo-shop", "demo-cafe", "demo-salon", "demo-clinic", "demo-restaurant", "demo-corporate"];
async function main() {
  const db = getDb();
  const rows = await withPlatform(db, (tx) => tx.select({ slug: tenants.slug, theme: tenants.theme }).from(tenants).where(inArray(tenants.slug, SLUGS)));
  for (const r of rows) {
    const t = resolveTheme(r.theme);
    console.log(`\n== ${r.slug} preset=${t.preset.key} mode=${t.mode} warnings=${JSON.stringify(t.warnings)} customColors=${JSON.stringify((r.theme as any)?.colors ?? {})}`);
    for (const [name, p] of [["light", t.light], ["dark", t.dark]] as const) {
      const pairs: [string, string, string, number][] = [
        ["fg/bg", p.foreground, p.background, 4.5],
        ["muted/bg", p.mutedForeground, p.background, 4.5],
        ["muted/card", p.mutedForeground, p.card, 4.5],
        ["muted/muted", p.mutedForeground, p.muted, 4.5],
        ["primaryFg/primary", p.primaryForeground, p.primary, 4.5],
        ["primary/bg (link text)", p.primary, p.background, 4.5],
        ["secondaryFg/secondary", p.secondaryForeground, p.secondary, 4.5],
        ["accentFg/accent", p.accentForeground, p.accent, 4.5],
        ["cardFg/card", p.cardForeground, p.card, 4.5],
        ["destructive/bg", p.destructive, p.background, 4.5],
        ["border/bg (UI 3:1)", p.border, p.background, 3],
        ["input/bg (UI 3:1)", p.input, p.background, 3],
      ];
      const line = pairs.map(([n, a, b, min]) => { const c = contrast(a, b); return `${c < min ? "FAIL " : ""}${n}=${c.toFixed(2)}(${a} on ${b})`; });
      console.log(`  [${name}] ` + line.filter((l) => l.startsWith("FAIL")).join(" | "));
      console.log(`     ok: ` + line.filter((l) => !l.startsWith("FAIL")).map((l) => l.split("(")[0]).join(", "));
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
