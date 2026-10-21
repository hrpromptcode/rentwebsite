import * as React from "react";
import type { z } from "zod";
import { cn } from "@rentweb/ui/lib/utils";
import { WordCycler } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { interlude } from "../definitions";
import { CtaButton, Prose, RevealHeading, Rise, Section, fxOf, hasAccentFont } from "./_shared";
import { Poster, SceneLayer, presetKey, resolveScene, sceneRole } from "./_scene";

type Props = z.output<typeof interlude.schema>;

/** A full-viewport 3D moment between content sections, with one statement over a scrim that keeps AA. */
export function InterludeSection({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  const fx = fxOf(p);
  const preset = presetKey(ctx);
  const image = p.image?.url || undefined;
  const scene = resolveScene(ctx, p.scene, fx, { image });
  const role = sceneRole(scene);
  const left = p.align === "left";
  const words = p.words.filter(Boolean);
  const box = scene === "breathing-orb" ? "absolute left-1/2 top-1/2 aspect-square w-[min(80vw,62svh)] -translate-x-1/2 -translate-y-1/2" : "absolute inset-0";
  return (
    <Section
      type="interlude"
      fx={fx}
      heavy={scene !== "none"}
      className={cn("isolate flex flex-col justify-center overflow-clip !py-0", p.height === "tall" ? "min-h-[130svh]" : "min-h-[100svh]")}
    >
      <div className="absolute inset-0 -z-10">
        {scene === "none" ? (
          <Poster preset={preset} image={image} imageAlt={p.image?.alt} className="absolute inset-0" />
        ) : (
          <>
            {role !== "replace" && <Poster preset={preset} className="absolute inset-0 opacity-60" />}
            <div className={box}>
              <SceneLayer kind={scene} preset={preset} placement="full" image={image} imageAlt={p.image?.alt} words={words} className={scene === "breathing-orb" ? "relative h-full w-full" : undefined} />
            </div>
          </>
        )}
        <div aria-hidden className={cn("absolute inset-0", left ? "rw-scrim-bottom" : "rw-scrim-radial")} />
      </div>
      <div className={cn("container-x relative py-24", left ? "text-left" : "text-center")}>
        <div className={cn("max-w-4xl", !left && "mx-auto")}>
          {p.heading && <RevealHeading as="h2" text={p.heading} fx={fx} accent={hasAccentFont(ctx)} className="font-heading text-step-5 font-semibold text-balance" />}
          {words.length > 0 && fx !== "off" && scene !== "particle-morph" && (
            <p className="mt-4 font-heading text-step-4 font-semibold text-primary-ink">
              <WordCycler words={words} mode="blur" />
            </p>
          )}
          {p.body && (
            <Rise fx={fx} delay={0.15}>
              <Prose text={p.body} className={cn("mt-6 max-w-2xl text-step-1 text-muted-foreground", !left && "mx-auto")} />
            </Rise>
          )}
          {p.cta?.label && (
            <Rise fx={fx} delay={0.25} className={cn("mt-10 flex", !left && "justify-center")}>
              <CtaButton href={p.cta.href} label={p.cta.label} fx={fx} />
            </Rise>
          )}
        </div>
      </div>
    </Section>
  );
}
