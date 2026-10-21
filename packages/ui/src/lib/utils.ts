import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge that knows the hi-end kit utilities (packages/ui/src/styles/motion-kit.css): without this,
 * `text-step-5 text-primary` loses `text-step-5` (unknown `text-*` values are treated as colours).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [(v: string) => /^step-(?:-1|[0-8])$/.test(v)] }],
      "font-family": [{ font: ["accent", "mono", "display", "heading", "body"] }],
      shadow: [{ shadow: ["float", "glow"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
