import { listTemplates } from "@rentweb/templates";
import { getPreset, PRESETS, FONTS } from "@rentweb/core/theme";
for (const t of listTemplates()) {
  const p = getPreset(t.themePreset);
  console.log(JSON.stringify({ key: t.key, name: t.name, desc: t.description, cat: t.category, site: t.siteType, modules: t.modules, preset: t.themePreset, rec: t.recommendedPresets, prev: t.previewImage, theme: t.theme, presetName: p.name, mode: p.defaultMode, fonts: (p as any).fonts }));
}
console.log("presets", Object.keys(PRESETS).length, Object.keys(PRESETS).join(","));
console.log("fonts", Object.keys(FONTS).length, Object.values(FONTS).filter((f: any) => !f.latinOnly).length);
