"use client";

import * as React from "react";
import { ParticleMorph, ScenePoster, resolveFontFamily, type ParticleShape } from "@rentweb/ui/three";
import { WordCycler } from "@rentweb/ui/motion/word-cycler";
import { BUILDING, COFFEE, FLOWER, GAMEPAD, HOTEL, PERSON, SHOPPING_BAG, SPARKLES, TICKET, UTENSILS } from "./shapes";

/**
 * Hero choreography (§4.3 #2): the WordCycler's word and the ParticleMorph shape stay in sync. Shape 0 is the
 * "RentWeb" wordmark (intro, and the static frame under reduced motion); shape i+1 is the icon of word i.
 */
const SHAPES: ParticleShape[] = [
  { text: "RentWeb" },
  { svgPath: SHOPPING_BAG },
  { svgPath: SPARKLES },
  { svgPath: UTENSILS },
  { svgPath: COFFEE },
  { svgPath: HOTEL },
  { svgPath: TICKET },
  { svgPath: PERSON },
  { svgPath: GAMEPAD },
  { svgPath: FLOWER },
  { svgPath: BUILDING },
];

export const HERO_WORDS = ["ร้านค้า", "คลินิก", "ร้านอาหาร", "คาเฟ่", "โรงแรม", "อีเวนต์", "สตูดิโอโยคะ", "ร้านเติมเกม", "สปา", "เอเจนซี"];
const HUD = ["SHOP", "CLINIC", "RESTAURANT", "CAFE", "HOTEL", "EVENTS", "YOGA STUDIO", "GAME TOP-UP", "SPA", "AGENCY"];

const Ctx = React.createContext<{ active: number; setWord: (i: number) => void }>({ active: 0, setWord: () => {} });

export function HeroSync({ children }: { children: React.ReactNode }) {
  const [word, setWord] = React.useState(-1);
  const [intro, setIntro] = React.useState(true);
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setIntro(false), 1500);
    return () => clearTimeout(t);
  }, []);
  const active = intro ? 0 : Math.max(0, word) + 1;
  const value = React.useMemo(() => ({ active, setWord }), [active]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** WordCycler whose active index is published to the hero context (WordCycler onChange). */
export function HeroCycler({ className }: { className?: string }) {
  const { setWord } = React.useContext(Ctx);
  return (
    <span className="inline-block">
      <WordCycler words={HERO_WORDS} interval={2600} mode="roll" className={className} onChange={setWord} />
    </span>
  );
}

/** The particle stage + a mono HUD caption that names the current shape. */
export function HeroMorph({ className }: { className?: string }) {
  const { active } = React.useContext(Ctx);
  const [font, setFont] = React.useState<string | null>(null);
  React.useEffect(() => {
    setFont(resolveFontFamily("--font-accent"));
  }, []);
  const shapes = React.useMemo<ParticleShape[]>(() => (font ? [{ text: "RentWeb", font, weight: 600 }, ...SHAPES.slice(1)] : SHAPES), [font]);
  return (
    <div className={className}>
      {font ? (
        <ParticleMorph shapes={shapes} active={active} colors={["#FF6B3D", "#8E7DFF"]} pointerRepel={0.7} size={1.5} className="absolute inset-0" />
      ) : (
        <ScenePoster variant="orb" />
      )}
      <p className="mono-label pointer-events-none absolute bottom-0 right-[var(--gutter)] z-10 hidden items-center gap-2 text-muted-foreground md:flex" data-script="latin" aria-hidden="true">
        <span className="inline-block size-1.5 rounded-full bg-primary" />
        <span>FIG.{String(active).padStart(2, "0")}</span>
        <span className="opacity-50">—</span>
        <span className="text-foreground">{active === 0 ? "RENTWEB" : HUD[active - 1]}</span>
      </p>
    </div>
  );
}
