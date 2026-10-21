import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PRESET_KEYS, getPreset, resolveTheme, themeToCss } from "@rentweb/core";
import { Lab3D, type LabPreset } from "./lab-3d";

export const metadata: Metadata = { title: "3D kit lab", robots: { index: false, follow: false } };

/** Dev-only lab for the 3D kit (packages/ui/src/three). Every component, sample data, live theme switching. */
export default function Lab3DPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const presets: LabPreset[] = PRESET_KEYS.map((key) => {
    const css = themeToCss(resolveTheme({ preset: key }));
    return { key, name: getPreset(key).name.en, defaultMode: getPreset(key).defaultMode, light: css.lightVars, dark: css.darkVars };
  });
  return <Lab3D presets={presets} />;
}
