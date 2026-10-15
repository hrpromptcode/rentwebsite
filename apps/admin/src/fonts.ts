/**
 * Admin app fonts: Prompt for headings, IBM Plex Sans Thai for body.
 * next/font requires each loader to be a top-level const with literal options.
 */
import { IBM_Plex_Sans_Thai, Prompt } from "next/font/google";

export const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-prompt",
});

export const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-ibm-plex-sans-thai",
});

export const fontClassNames = `${prompt.variable} ${ibmPlexSansThai.variable}`;
