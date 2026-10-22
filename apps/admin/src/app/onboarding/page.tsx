import type { Metadata } from "next";
import { PRESETS } from "@rentweb/core/theme";
import { FONTS } from "@rentweb/core/theme";
import { env, rootHost } from "@rentweb/core/env";
import { listTemplates } from "@rentweb/templates";
import { requireSession } from "@/lib/session";
import { OnboardingWizard, type PresetSummary, type TemplateSummary } from "./wizard";

export const metadata: Metadata = { title: "สร้างเว็บไซต์ใหม่" };

export default async function OnboardingPage() {
  await requireSession("/onboarding");

  // live storefront screenshots served by the platform site (apps/web/public/showcase), Unsplash preview as fallback
  const showcase = `${env().WEB_URL.replace(/\/+$/, "")}/showcase`;
  const templates: TemplateSummary[] = listTemplates().map((t) => ({
    key: t.key,
    name: t.name.th,
    description: t.description.th,
    category: t.category,
    modules: t.modules,
    themePreset: t.themePreset,
    recommendedPresets: t.recommendedPresets?.length ? t.recommendedPresets : [t.themePreset],
    previewImage: t.previewImage ?? null,
    shot: `${showcase}/${t.key}.webp`,
    complexity: t.complexity ?? 1,
    demoUrl: `${rootHost().startsWith("localhost") ? "http" : "https"}://demo-${t.key}.${rootHost()}`,
  }));

  const presets: PresetSummary[] = Object.values(PRESETS).map((p) => {
    const pal = p.defaultMode === "dark" ? p.dark : p.light;
    return {
      key: p.key,
      name: p.name.th,
      description: p.description.th,
      defaultMode: p.defaultMode,
      colors: { background: pal.background, foreground: pal.foreground, primary: pal.primary, accent: pal.accent, card: pal.card, muted: pal.muted },
      fonts: { heading: FONTS[p.fonts.heading]?.family ?? p.fonts.heading, body: FONTS[p.fonts.body]?.family ?? p.fonts.body },
      radius: p.radius,
      buttonStyle: p.layout.buttonStyle,
    };
  });

  return <OnboardingWizard templates={templates} presets={presets} rootHost={rootHost()} />;
}
