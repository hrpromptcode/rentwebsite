/**
 * RentWeb platform identity fonts for the admin's first-impression screens (login, signup, onboarding) —
 * docs/design/hi-end-direction.md §4.1: Anuphan (Thai display), Unbounded (wordmark / numerals), JetBrains Mono (HUD
 * labels). IBM Plex Sans Thai (body) is already loaded by the admin root layout. next/font needs module-level consts.
 */
import { Anuphan, JetBrains_Mono, Unbounded } from "next/font/google";

export const anuphan = Anuphan({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-rw-anuphan" });
export const unbounded = Unbounded({ subsets: ["latin"], weight: ["500", "600"], display: "swap", variable: "--font-rw-unbounded" });
export const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", preload: false, variable: "--font-rw-mono" });

export const brandFontClasses = `${anuphan.variable} ${unbounded.variable} ${jetbrainsMono.variable}`;
