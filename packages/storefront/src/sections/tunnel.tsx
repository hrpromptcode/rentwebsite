import * as React from "react";
import type { z } from "zod";
import { WormholeTunnel } from "@rentweb/ui/three";
import type { StorefrontCtx } from "../ctx";
import type { tunnel } from "../definitions";
import { Section, SectionHeading, allow3d, fxOf, hasAccentFont, pad2, sized } from "./_shared";
import { NumberedSteps } from "./steps";

type Props = z.output<typeof tunnel.schema>;

/** The camera flies through a wireframe tunnel as you scroll, one step card at a time (calm / no 3D = numbered grid). */
export function TunnelSection({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  const steps = p.steps.filter((s) => s.title);
  if (!steps.length) return null;
  const fx = fxOf(p);
  const live = allow3d(ctx, fx);
  const head = <SectionHeading eyebrow={p.eyebrow} heading={p.heading} align={live ? "center" : "left"} layout={live ? "stack" : "split"} fx={fx} accent={hasAccentFont(ctx)} />;
  if (!live) {
    return (
      <Section type="tunnel" fx={fx}>
        <div className="container-x">
          {head}
          <NumberedSteps fx={fx} items={steps.map((s) => ({ title: s.title, description: s.body, kicker: s.kicker || undefined }))} />
        </div>
      </Section>
    );
  }
  return (
    <Section type="tunnel" fx={fx} heavy className="!pb-0">
      <div className="container-x">{head}</div>
      <WormholeTunnel
        steps={steps.map((s, i) => ({ kicker: s.kicker || `${pad2(i + 1)} / ${pad2(steps.length)}`, title: s.title, body: s.body || undefined, image: s.image ? sized(s.image, 1024) : undefined }))}
        tint={p.tint}
        length={p.length}
        ariaLabel={p.heading || "ขั้นตอน"}
      />
    </Section>
  );
}
