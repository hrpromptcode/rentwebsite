/**
 * @rentweb/ui/three — the 3D kit (§3.1 of docs/design/hi-end-direction.md). API notes: tooling/qa/redesign/kit3d.md.
 * This barrel never imports three.js eagerly: every component is a light client wrapper that lazy-loads its scene
 * (and Scene3D lazy-loads the r3f canvas). Server components may render the wrappers with serialisable props.
 */
export * from "./core/types";
export { mulberry32, seedFromString, seeded, rand } from "./core/random";
export { ScenePoster, GRAIN_URL, type ScenePosterProps } from "./core/poster";
export { KitStyles } from "./core/kit-styles";
export { Scene3D, useSceneEnv, useOptionalSceneEnv, type Scene3DProps, type SceneEnv, type SceneStatus } from "./core/scene-3d";
export { useCapability, computeCapability, detectWebgl, type Capability } from "./core/use-capability";
export { useThemeHex, resolveCssColor, readThemeHex, subscribeThemeChange, isDarkColor, luminance, hexToRgba, rgbaToHex, type Rgba } from "./core/theme-colors";
export { useSectionProgress, type SectionProgressOptions } from "./core/use-section-progress";
export { drawTextTexture, sampleTextPoints, sampleSvgPathPoints, sampleImagePoints, resolveFontFamily, ensureFont, wrapText } from "./core/canvas-text";

// P0
export { ShaderBackdrop, type ShaderBackdropProps, type ShaderBackdropVariant } from "./shader-backdrop";
export { CurvedGallery, type CurvedGalleryProps, type CurvedGalleryItem } from "./curved-gallery";
export { ParticleMorph, type ParticleMorphProps, type ParticleShape } from "./particle-morph";
export { FloatingObjects, type FloatingObjectsProps, type FloatingSet, type FloatingMaterial } from "./floating-objects";
export { WormholeTunnel, type WormholeTunnelProps, type TunnelStep } from "./wormhole-tunnel";
// P1
export { OceanSurface, type OceanSurfaceProps } from "./ocean-surface";
export { StageLights, type StageLightsProps } from "./stage-lights";
export { Ticket3D, type Ticket3DProps } from "./ticket-3d";
export { CardStack3D, type CardStack3DProps, type CardStackItem } from "./card-stack-3d";
export { BreathingOrb, breathAt, type BreathingOrbProps } from "./breathing-orb";
export { SteamRise, type SteamRiseProps } from "./steam-rise";
export { ImageSilk, type ImageSilkProps } from "./image-silk";
// P2
export { MediaPlanes, type MediaPlanesProps } from "./media-planes";

// legacy (pre-redesign) scenes, now lazy so the barrel stays light
export { OrbScene, FloatingShapes } from "./legacy";
