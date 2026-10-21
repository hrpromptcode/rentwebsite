import * as React from "react";
import { ShaderBackdrop, type ShaderBackdropVariant } from "../three/shader-backdrop";
import { ParticleMorph, type ParticleShape } from "../three/particle-morph";
import { FloatingObjects, type FloatingMaterial, type FloatingSet } from "../three/floating-objects";
import { CardStack3D, type CardStackItem } from "../three/card-stack-3d";
import { BreathingOrb } from "../three/breathing-orb";
import { ImageSilk } from "../three/image-silk";
import { OceanSurface } from "../three/ocean-surface";
import { StageLights } from "../three/stage-lights";
import { SteamRise } from "../three/steam-rise";

export const SCENE_KINDS = [
  "auto",
  "none",
  "particle-morph",
  "floating-objects",
  "card-stack",
  "breathing-orb",
  "image-silk",
  "ocean",
  "stage-lights",
  "steam",
  "water-ripple",
  "shader",
] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];

/** Each preset's signature scene (§3.2 table). Presets not listed resolve to "none". */
export const SCENE_BY_PRESET: Record<string, Exclude<SceneKind, "auto">> = {
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

const MORPH_BY_PRESET: Record<string, ParticleShape[]> = {
  midnight: ["star", "crystal-flower"],
  studio: ["wave", "sphere"],
  obsidian: ["crystal-flower", "star", "globe"],
};
const OBJECTS_BY_PRESET: Record<string, { set: FloatingSet; material: FloatingMaterial; interactive?: "none" | "poke" | "drag" }> = {
  porcelain: { set: "clinic", material: "glass" },
  quartz: { set: "corporate", material: "chrome" },
  candy: { set: "pastry", material: "clay", interactive: "poke" },
};
const SHADER_BY_PRESET: Record<string, ShaderBackdropVariant> = {
  aurora: "silk",
  neon: "mesh",
  ember: "ember",
  zen: "caustics",
  riviera: "caustics",
  candy: "grain-gradient",
};

/** "auto" → the preset's signature scene; anything else passes through. */
export function resolveSceneKind(kind: SceneKind | string | undefined, preset: string): Exclude<SceneKind, "auto"> {
  if (!kind || kind === "auto") return SCENE_BY_PRESET[preset] ?? "none";
  return (SCENE_KINDS as readonly string[]).includes(kind) ? (kind as Exclude<SceneKind, "auto">) : "none";
}

export interface HeroSceneProps {
  kind?: SceneKind;
  /** theme preset key (data-preset): picks the scene for "auto" and its per-preset flavour */
  preset: string;
  /** photo for image-silk / water-ripple (and their posters) */
  image?: string;
  imageAlt?: string;
  /** items for card-stack (game covers, products …) */
  cards?: CardStackItem[];
  /** particle-morph: words morphed into after the preset shapes (≤ 3 used) */
  words?: string[];
  className?: string;
}

/**
 * THE single 3D switch sections use (§3.2). Server-safe (no hooks): it returns the matching kit3d wrapper, each of
 * which renders its poster on the server and lazy-mounts WebGL near the viewport (theme colours, capability tiers,
 * html[data-scene3d] auto/lite/off and reduced motion are handled inside the 3D kit). Falls back to a shader backdrop
 * when a scene lacks its required input (no image / no cards). Returns null for "none".
 */
export function HeroScene({ kind = "auto", preset, image, imageAlt = "", cards, words, className }: HeroSceneProps) {
  const scene = resolveSceneKind(kind, preset);
  const shader = <ShaderBackdrop variant={SHADER_BY_PRESET[preset] ?? "aurora"} className={className ?? "absolute inset-0"} />;
  switch (scene) {
    case "none":
      return null;
    case "shader":
      return shader;
    case "particle-morph": {
      const base = MORPH_BY_PRESET[preset] ?? ["sphere", "crystal-flower"];
      const extra: ParticleShape[] = (words ?? []).filter(Boolean).slice(0, 3).map((text) => ({ text }));
      return <ParticleMorph shapes={[...base, ...extra].slice(0, 6)} morphOn="time" auto={{ interval: 5 }} className={className ?? "absolute inset-0"} />;
    }
    case "floating-objects": {
      const o = OBJECTS_BY_PRESET[preset] ?? { set: "abstract" as FloatingSet, material: "auto" as FloatingMaterial };
      return <FloatingObjects set={o.set} material={o.material} interactive={o.interactive ?? "none"} layout="scatter" clearCenter={0.38} className={className ?? "absolute inset-0"} />;
    }
    case "card-stack":
      return cards?.length ? <CardStack3D items={cards.slice(0, 8)} layout="fan" floor="synthgrid" className={className ?? "relative h-full w-full min-h-[420px]"} /> : shader;
    case "breathing-orb":
      return <BreathingOrb className={className ?? "relative h-full w-full"} />;
    case "image-silk":
      return image ? <ImageSilk image={image} alt={imageAlt} className={className ?? "relative h-full w-full"} /> : shader;
    case "ocean":
      return <OceanSurface mode="ocean" className={className ?? "absolute inset-0"} />;
    case "water-ripple":
      return image ? <OceanSurface mode="ripple" image={image} imageAlt={imageAlt} className={className ?? "absolute inset-0"} /> : shader;
    case "stage-lights":
      return <StageLights crowd className={className ?? "absolute inset-0"} />;
    case "steam":
      return <SteamRise origin="bottom" className={className ?? "absolute inset-0"} />;
    default:
      return null;
  }
}
