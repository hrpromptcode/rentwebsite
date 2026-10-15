import * as React from "react";
import type { z } from "zod";
import { Marquee } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { logos } from "../definitions";
import { Img, Section } from "./_shared";

type Props = z.output<typeof logos.schema>;

export function Logos({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  if (!p.items.length) return null;
  const imgs = p.items.map((im, i) => <Img key={i} src={im.url} alt={im.alt} className="h-8 w-auto opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0 md:h-10" />);
  return (
    <Section className="!py-10">
      <div className="container-x">
        {p.heading && <p className="mb-6 text-center text-sm text-muted-foreground">{p.heading}</p>}
        {p.marquee ? <Marquee duration={35} gap="4rem">{imgs}</Marquee> : <div className="flex flex-wrap items-center justify-center gap-10">{imgs}</div>}
      </div>
    </Section>
  );
}
