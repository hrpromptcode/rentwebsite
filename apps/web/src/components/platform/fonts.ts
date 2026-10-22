/**
 * Latin accent + mono faces for the platform showcase: Manrope (the PromptCode brand face) for the RentWeb wordmark,
 * numerals and giant Latin titles; JetBrains Mono for tiny HUD labels / clocks. Thai faces (Anuphan display, IBM Plex
 * Sans Thai body) come from the shared apps/web/src/fonts.ts. Variables are referenced by components/platform/platform.css.
 */
import { JetBrains_Mono, Manrope } from "next/font/google";

export const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap", variable: "--font-pf-manrope" });
export const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", preload: false, variable: "--font-pf-mono" });
