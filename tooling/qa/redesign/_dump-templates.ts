import { listTemplates } from "@rentweb/templates";
for (const t of listTemplates()) {
  console.log(`\n### ${t.key} (${t.themePreset}) ${t.name.th} — pages: ${t.pages.map((p) => p.slug).join(",")}`);
  console.log(`theme override: ${JSON.stringify(t.theme ?? {}).slice(0, 300)}`);
  const home = t.pages.find((p) => p.slug === "home");
  for (const s of home?.sections ?? []) {
    const p = s.props as Record<string, unknown>;
    const v = ["variant", "layout", "style", "cardStyle", "background", "source", "imagePosition", "columns"].filter((k) => p[k] !== undefined).map((k) => `${k}=${p[k]}`).join(" ");
    console.log(`- ${s.type} ${v} | ${String(p.heading ?? p.text ?? (p.items as unknown[] | undefined)?.slice?.(0, 3) ?? "").slice(0, 70)}`);
  }
}
