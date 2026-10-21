import * as React from "react";
import {
  BreathingOrb,
  CardStack3D,
  FloatingObjects,
  ImageSilk,
  OceanSurface,
  ParticleMorph,
  ScenePoster,
  ShaderBackdrop,
  StageLights,
  SteamRise,
  type FloatingMaterial,
  type FloatingSet,
  type ParticleShape,
  type ShaderBackdropVariant,
} from "@rentweb/ui/three";
import type { StorefrontCtx } from "../ctx";
import { allow3d, type Fx } from "./_shared";

/* ================================================================================================================
   Scene switch for sections (hero, interlude …). Same vocabulary as @rentweb/ui/fx HeroScene (SceneKind,
   SCENE_BY_PRESET) but with placement-aware props: a scene inside a media column, behind a centred headline or
   full-bleed. All wrappers are client islands that SSR their poster and lazy-mount WebGL near the viewport.
   ================================================================================================================ */

export type SceneKind = "auto" | "none" | "particle-morph" | "floating-objects" | "card-stack" | "breathing-orb" | "image-silk" | "ocean" | "stage-lights" | "steam" | "water-ripple" | "shader";
export type ResolvedScene = Exclude<SceneKind, "auto">;
export type PosterVariant = "aurora" | "silk" | "mesh" | "ocean" | "stage" | "ember" | "orb" | "grid" | "plain";

/** each preset's signature scene (§3.2) */
const SCENE_BY_PRESET: Record<string, ResolvedScene> = {
  aurora: "image-silk",
  neon: "card-stack",
  porcelain: "floating-objects",
  ember: "steam",
  zen: "water-ripple",
  quartz: "floating-objects",
  candy: "floating-objects",
  midnight: "particle-morph",
  studio: "particle-morph",
  loft: "breathing-orb",
  riviera: "ocean",
  stage: "stage-lights",
  obsidian: "particle-morph",
};

const SHADER_BY_PRESET: Record<string, ShaderBackdropVariant> = {
  aurora: "silk",
  neon: "mesh",
  porcelain: "silk",
  ember: "ember",
  zen: "caustics",
  quartz: "mesh",
  candy: "grain-gradient",
  midnight: "aurora",
  studio: "mesh",
  loft: "grain-gradient",
  riviera: "caustics",
  stage: "aurora",
  obsidian: "mesh",
};

const POSTER_BY_PRESET: Record<string, PosterVariant> = {
  aurora: "silk",
  neon: "grid",
  porcelain: "silk",
  ember: "ember",
  zen: "ocean",
  quartz: "mesh",
  candy: "aurora",
  midnight: "orb",
  studio: "mesh",
  loft: "orb",
  riviera: "ocean",
  stage: "stage",
  obsidian: "orb",
};

const MORPH_BY_PRESET: Record<string, ParticleShape[]> = {
  midnight: ["star", "crystal-flower"],
  studio: ["wave", "sphere"],
  obsidian: ["crystal-flower", "star", "globe"],
};

const OBJECTS_BY_PRESET: Record<string, { set: FloatingSet; material: FloatingMaterial; interactive?: "none" | "poke" | "drag" }> = {
  porcelain: { set: "clinic", material: "glass" },
  quartz: { set: "corporate", material: "chrome" },
  candy: { set: "pastry", material: "clay", interactive: "poke" },
  aurora: { set: "fashion", material: "satin" },
  neon: { set: "gaming", material: "chrome" },
  ember: { set: "food", material: "clay" },
  zen: { set: "spa", material: "satin" },
  loft: { set: "yoga", material: "clay" },
  riviera: { set: "resort", material: "glass" },
  stage: { set: "events", material: "auto" },
};

const KINDS: readonly string[] = ["none", "particle-morph", "floating-objects", "card-stack", "breathing-orb", "image-silk", "ocean", "stage-lights", "steam", "water-ripple", "shader"];

export const presetKey = (ctx: StorefrontCtx) => ctx.theme.preset.key;
export const shaderFor = (preset: string): ShaderBackdropVariant => SHADER_BY_PRESET[preset] ?? "aurora";
export const posterFor = (preset: string): PosterVariant => POSTER_BY_PRESET[preset] ?? "aurora";

/**
 * Resolves the scene a section should mount: "auto" → the preset's signature scene; scenes that need an input fall back
 * (no photo → shader, no cards → shader); fx calm/off or theme scene3d=off → "none" (callers render the poster/photo).
 */
export function resolveScene(ctx: StorefrontCtx, kind: string | undefined, fx: Fx, input: { image?: string; cards?: number } = {}): ResolvedScene {
  if (!allow3d(ctx, fx)) return "none";
  const preset = presetKey(ctx);
  let k: ResolvedScene = !kind || kind === "auto" ? (SCENE_BY_PRESET[preset] ?? "none") : KINDS.includes(kind) ? (kind as ResolvedScene) : "none";
  // a scene missing its input falls back to the preset's floating objects (or a shader backdrop)
  const fallback: ResolvedScene = OBJECTS_BY_PRESET[preset] ? "floating-objects" : "shader";
  if ((k === "image-silk" || k === "water-ripple") && !input.image) k = fallback;
  if (k === "card-stack" && !(input.cards && input.cards >= 3)) k = fallback;
  return k;
}

/** How a scene relates to the section photo. */
export function sceneRole(k: ResolvedScene): "replace" | "overlay" | "standalone" | "none" {
  if (k === "none") return "none";
  if (k === "image-silk" || k === "water-ripple") return "replace";
  if (k === "steam" || k === "stage-lights" || k === "floating-objects") return "overlay";
  return "standalone";
}

export type ScenePlacement = "media" | "backdrop" | "full";

/**
 * Renders the kit wrapper for a resolved scene. `placement` tunes props: media = inside a framed media column,
 * backdrop = behind a centred headline (objects keep the centre clear), full = full-bleed section.
 */
export function SceneLayer({
  kind,
  preset,
  placement,
  image,
  imageAlt = "",
  cards,
  words,
  className,
}: {
  kind: ResolvedScene;
  preset: string;
  placement: ScenePlacement;
  image?: string;
  imageAlt?: string;
  cards?: Array<{ image: string; title: string; badge?: string; href?: string }>;
  words?: string[];
  className?: string;
}) {
  const abs = className ?? "absolute inset-0";
  switch (kind) {
    case "none":
      return null;
    case "shader":
      return <ShaderBackdrop variant={shaderFor(preset)} className={abs} />;
    case "particle-morph": {
      const base = MORPH_BY_PRESET[preset] ?? ["sphere", "crystal-flower"];
      const extra: ParticleShape[] = (words ?? []).filter(Boolean).slice(0, 3).map((text) => ({ text }));
      return <ParticleMorph shapes={[...base, ...extra].slice(0, 6)} morphOn="time" auto={{ interval: 5 }} depth={placement === "media" ? 0.3 : 0.4} className={abs} />;
    }
    case "floating-objects": {
      const o = OBJECTS_BY_PRESET[preset] ?? { set: "abstract" as FloatingSet, material: "auto" as FloatingMaterial };
      return (
        <FloatingObjects
          set={o.set}
          material={o.material}
          interactive={placement === "media" ? (o.interactive ?? "none") : "none"}
          layout={placement === "media" ? "orbit" : "scatter"}
          clearCenter={placement === "backdrop" ? 0.42 : placement === "full" ? 0.3 : 0}
          className={abs}
        />
      );
    }
    case "card-stack":
      return cards?.length ? (
        <CardStack3D items={cards.slice(0, 8)} layout={placement === "media" ? "orbit" : "fan"} floor="synthgrid" ariaLabel="เลือกเกม" className={className ?? "relative h-full w-full min-h-[420px]"} />
      ) : (
        <ShaderBackdrop variant={shaderFor(preset)} className={abs} />
      );
    case "breathing-orb":
      return <BreathingOrb className={className ?? "relative h-full w-full"} />;
    case "image-silk":
      return image ? <ImageSilk image={image} alt={imageAlt} className={className ?? "relative h-full w-full"} /> : <ShaderBackdrop variant={shaderFor(preset)} className={abs} />;
    case "ocean":
      return <OceanSurface mode="ocean" className={abs} />;
    case "water-ripple":
      return image ? <OceanSurface mode="ripple" image={image} imageAlt={imageAlt} className={abs} /> : <ShaderBackdrop variant={shaderFor(preset)} className={abs} />;
    case "stage-lights":
      return <StageLights crowd={placement !== "media"} className={abs} />;
    case "steam":
      return <SteamRise origin="bottom" density={placement === "media" ? 0.8 : 1} className={abs} />;
    default:
      return null;
  }
}

/** Server-safe static art in the theme colours (fallback / calm sections). */
export function Poster({ preset, variant, image, imageAlt, className }: { preset: string; variant?: PosterVariant; image?: string; imageAlt?: string; className?: string }) {
  return <ScenePoster variant={variant ?? posterFor(preset)} image={image || undefined} imageAlt={imageAlt} className={className} />;
}
