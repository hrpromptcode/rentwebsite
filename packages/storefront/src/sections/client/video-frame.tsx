"use client";

import * as React from "react";
import { Play } from "lucide-react";
import { Magnetic } from "@rentweb/ui/motion";
import { cn } from "@rentweb/ui/lib/utils";

/**
 * Cinematic video frame: poster + a magnetic round play button (cursor "play"). Nothing loads from the video host until
 * the visitor clicks; then the iframe replaces the poster in place (autoplay is allowed: it is the user's gesture).
 */
export function VideoFrame({ src, poster, title, aspectClass, label = "เล่นวิดีโอ", still = false }: { src: string; poster?: string; title: string; aspectClass: string; label?: string; still?: boolean }) {
  const [playing, setPlaying] = React.useState(false);
  const play = <span className="rw-pulse-ring relative flex size-20 items-center justify-center rounded-full bg-background text-foreground shadow-float transition-transform duration-500 group-hover:scale-110 md:size-28">
    <Play aria-hidden className="ml-1 size-7 fill-current md:size-9" />
  </span>;
  return (
    <div className={cn("relative mx-auto overflow-hidden rounded-[var(--radius-2xl)] bg-neutral-950 shadow-float", aspectClass)}>
      {playing ? (
        <iframe src={`${src}${src.includes("?") ? "&" : "?"}autoplay=1`} title={title} className="absolute inset-0 size-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={`${label}: ${title}`} data-cursor="play" data-cursor-label="เล่น" className="group absolute inset-0 block size-full text-left">
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover opacity-90 transition duration-1000 group-hover:scale-[1.03] group-hover:opacity-100" />
          ) : (
            <span aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_90%_at_30%_20%,color-mix(in_oklab,var(--primary)_45%,black),black_70%)]" />
          )}
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/20" />
          <span className="absolute inset-0 flex items-center justify-center">{still ? play : <Magnetic strength={0.45} max={22}>{play}</Magnetic>}</span>
          <span aria-hidden className="absolute bottom-5 left-6 flex items-center gap-3 font-mono text-xs tracking-[0.12em] text-white/85 uppercase md:bottom-8 md:left-9">
            <span className="size-2 rounded-full bg-red-500" /> Play film
          </span>
        </button>
      )}
    </div>
  );
}
