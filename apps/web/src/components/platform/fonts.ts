/**
 * Latin accent + mono + editorial serif faces for the platform showcase: Manrope (the PromptCode brand face, variable
 * 200–800) for the RentWeb wordmark, numerals and giant Latin titles (the thin 200 cut for the "Templates" title);
 * Instrument Serif italic for small editorial accents (the "(10)" count); JetBrains Mono for tiny HUD labels / clocks.
 * Thai faces (Anuphan display, IBM Plex Sans Thai body) come from the shared apps/web/src/fonts.ts. Variables are
 * referenced by components/platform/platform.css.
 */
import { Instrument_Serif, JetBrains_Mono, Manrope } from "next/font/google";

export const manrope = Manrope({ subsets: ["latin"], weight: "variable", display: "swap", variable: "--font-pf-manrope" });
export const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", preload: false, variable: "--font-pf-mono" });
export const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], display: "swap", preload: false, variable: "--font-pf-serif" });
