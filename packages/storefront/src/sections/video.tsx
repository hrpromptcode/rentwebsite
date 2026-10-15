import * as React from "react";
import type { z } from "zod";
import { Reveal } from "@rentweb/ui/motion";
import type { StorefrontCtx } from "../ctx";
import type { video } from "../definitions";
import { Section, SectionHeading } from "./_shared";

type Props = z.output<typeof video.schema>;

function embedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

export function Video({ props: p }: { ctx: StorefrontCtx; props: Props }) {
  const src = embedUrl(p.url);
  if (!src) return null;
  const aspect = p.aspect === "9/16" ? "aspect-[9/16] max-w-sm" : p.aspect === "1/1" ? "aspect-square max-w-2xl" : "aspect-video max-w-5xl";
  return (
    <Section>
      <div className="container-x">
        <SectionHeading heading={p.heading} />
        <Reveal direction="scale" className={`mx-auto overflow-hidden rounded-[var(--radius-2xl)] border shadow-2xl ${aspect}`}>
          <iframe src={src} title={p.heading || "video"} className="size-full" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </Reveal>
      </div>
    </Section>
  );
}
