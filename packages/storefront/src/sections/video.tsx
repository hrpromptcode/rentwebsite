import * as React from "react";
import type { z } from "zod";
import type { StorefrontCtx } from "../ctx";
import type { video } from "../definitions";
import { Rise, Section, SectionHeading, fxOf, hasAccentFont } from "./_shared";
import { VideoFrame } from "./client/video-frame";

type Props = z.output<typeof video.schema>;

function embed(url: string): { src: string; poster?: string } | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`, poster: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` };
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return { src: `https://player.vimeo.com/video/${vm[1]}` };
  return null;
}

/** Cinematic poster frame; the player loads only on click (no third-party request before that). */
export function Video({ ctx, props: p }: { ctx: StorefrontCtx; props: Props }) {
  const e = embed(p.url);
  if (!e) return null;
  const fx = fxOf(p);
  const aspect = p.aspect === "9/16" ? "aspect-[9/16] max-w-sm" : p.aspect === "1/1" ? "aspect-square max-w-3xl" : "aspect-video max-w-6xl";
  return (
    <Section type="video" fx={fx}>
      <div className="container-x">
        <SectionHeading heading={p.heading} fx={fx} accent={hasAccentFont(ctx)} />
        <Rise fx={fx} direction="scale">
          <VideoFrame src={e.src} poster={p.poster || e.poster} title={p.heading || "video"} aspectClass={aspect} still={fx === "off"} />
        </Rise>
      </div>
    </Section>
  );
}
