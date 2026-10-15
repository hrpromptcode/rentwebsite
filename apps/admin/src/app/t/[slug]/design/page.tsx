import type { Metadata } from "next";
import { FONTS, PRESETS, parseTheme, resolveTheme } from "@rentweb/core/theme";
import { getTemplate } from "@rentweb/templates";
import { PageHeader } from "@/components/ui/page-header";
import { getTenantCtx, hasRole } from "@/lib/tenant";
import type { PresetSummary } from "@/app/onboarding/wizard";
import { ThemeEditor, type FontOption } from "./theme-editor";

export const metadata: Metadata = { title: "ดีไซน์และธีม" };

export default async function DesignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getTenantCtx(slug);
  const theme = parseTheme(ctx.tenant.theme);
  const resolved = resolveTheme(theme);
  const templateKey = (ctx.tenant.settings as { templateKey?: string }).templateKey ?? ctx.tenant.siteType;
  const template = getTemplate(templateKey);

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

  const fonts: FontOption[] = Object.values(FONTS).map((f) => ({ key: f.key, family: f.family, category: f.category, recommendedFor: f.recommendedFor, mood: f.mood }));

  return (
    <div className="space-y-6">
      <PageHeader title="ดีไซน์และธีม" description="เลือก preset ปรับสี ฟอนต์ เลย์เอาต์ และโลโก้ — ดูผลลัพธ์สดทางขวา แล้วกดบันทึกเพื่อเผยแพร่" />
      <ThemeEditor
        slug={slug}
        initial={theme}
        initialWarnings={resolved.warnings}
        presets={presets}
        recommendedPresets={template?.recommendedPresets ?? [template?.themePreset ?? theme.preset]}
        fonts={fonts}
        storefrontUrl={ctx.storefrontUrl}
        planKey={ctx.tenant.planKey}
        canEdit={hasRole(ctx, "admin")}
        resolvedPalette={resolved.light}
        resolvedLayout={resolved.layout}
        resolvedEffects={resolved.effects}
        resolvedFonts={resolved.fonts}
        resolvedRadius={resolved.radius}
        resolvedDensity={resolved.density}
      />
    </div>
  );
}
