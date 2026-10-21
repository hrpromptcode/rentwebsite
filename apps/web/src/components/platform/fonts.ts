/**
 * Latin accent + mono faces for the platform showcase (§4.1): Unbounded for the wordmark, numerals and giant Latin
 * titles; JetBrains Mono for tiny HUD labels / clocks. Thai faces (Anuphan display, IBM Plex Sans Thai body) come from
 * the shared apps/web/src/fonts.ts. Variables are referenced by components/platform/platform.css.
 */
import { JetBrains_Mono, Unbounded } from "next/font/google";

export const unbounded = Unbounded({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-pf-unbounded" });
export const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", preload: false, variable: "--font-pf-mono" });
