"use client";

import * as React from "react";
import { RouteTransition, type RouteTransitionStyle } from "@rentweb/ui/motion";

/** Theme presets for the lab: recolouring must restyle every kit component (tokens only). */
const THEMES: Record<string, Record<string, string>> = {
  noir: {
    "--background": "#07080B",
    "--foreground": "#F2F1EE",
    "--card": "#111318",
    "--card-foreground": "#F2F1EE",
    "--muted": "#15171D",
    "--muted-foreground": "#A3A6AE",
    "--primary": "#FF6B3D",
    "--primary-foreground": "#0A0A0A",
    "--primary-soft": "rgba(255,107,61,0.14)",
    "--accent": "#8E7DFF",
    "--accent-foreground": "#0A0A0A",
    "--glow": "#FF6B3D",
    "--surface": "#0D0F13",
    "--border": "#23262E",
    "--ring": "#FF8A64",
  },
  porcelain: {
    "--background": "#F7F4EF",
    "--foreground": "#1C1A17",
    "--card": "#FFFFFF",
    "--card-foreground": "#1C1A17",
    "--muted": "#ECE7DF",
    "--muted-foreground": "#5E584F",
    "--primary": "#9A5B3F",
    "--primary-foreground": "#FFFFFF",
    "--primary-soft": "rgba(154,91,63,0.12)",
    "--accent": "#3F6B5C",
    "--accent-foreground": "#FFFFFF",
    "--glow": "#E8C9A8",
    "--surface": "#F1ECE4",
    "--border": "#DDD5C9",
    "--ring": "#9A5B3F",
  },
  candy: {
    "--background": "#FFF5F8",
    "--foreground": "#2A1430",
    "--card": "#FFFFFF",
    "--card-foreground": "#2A1430",
    "--muted": "#FDE6EE",
    "--muted-foreground": "#6E4A70",
    "--primary": "#D6336C",
    "--primary-foreground": "#FFFFFF",
    "--primary-soft": "rgba(214,51,108,0.12)",
    "--accent": "#6741D9",
    "--accent-foreground": "#FFFFFF",
    "--glow": "#FFC9DE",
    "--surface": "#FFEFF4",
    "--border": "#F5C9D8",
    "--ring": "#D6336C",
  },
};

export function LabThemeSwitch() {
  const [theme, setTheme] = React.useState("noir");
  const apply = (key: string) => {
    const vars = THEMES[key]!;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    root.classList.toggle("dark", key === "noir");
    window.dispatchEvent(new Event("rw:theme"));
    setTheme(key);
  };
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-card/70 p-1 backdrop-blur" role="group" aria-label="ธีมทดสอบ">
      {Object.keys(THEMES).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => apply(k)}
          aria-pressed={theme === k}
          className="min-h-11 rounded-full px-4 text-xs font-semibold uppercase tracking-[0.08em] transition-colors aria-pressed:bg-foreground aria-pressed:text-background"
        >
          {k}
        </button>
      ))}
    </div>
  );
}

const STYLES: RouteTransitionStyle[] = ["fade", "rise", "curtain"];

/** Replays RouteTransition styles by changing its routeKey (what a layout does with the pathname). */
export function LabRouteDemo({ children }: { children: React.ReactNode }) {
  const [style, setStyle] = React.useState<RouteTransitionStyle>("rise");
  const [key, setKey] = React.useState(0);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        {STYLES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStyle(s);
              setKey((k) => k + 1);
            }}
            className="group min-h-11 rounded-full border border-border px-5 text-sm font-medium hover:bg-foreground hover:text-background"
          >
            เล่น {s}
          </button>
        ))}
      </div>
      <div className="relative overflow-hidden rounded-3xl border border-border">
        <RouteTransition style={style} routeKey={String(key)}>
          {children}
        </RouteTransition>
      </div>
    </div>
  );
}
