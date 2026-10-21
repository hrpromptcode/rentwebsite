"use client";

import * as React from "react";
import { Button } from "@rentweb/ui/components/button";

const KEY = "rw-theme";

export function ThemeToggle({ labels }: { labels: { dark: string; light: string } }) {
  const [dark, setDark] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("light", !next);
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* ignore */
    }
    setDark(next);
    // 3D scenes / canvases re-read theme colours
    window.dispatchEvent(new Event("rw:theme"));
  };
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? labels.light : labels.dark} className="rw-theme-toggle text-current md:size-9" data-dark={dark ? "true" : "false"}>
      {/* sun ↔ moon morph (§6.3): a mask circle slides over the sun to carve the crescent, the rays retract (320ms) */}
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className="rw-sunmoon">
        <mask id="rw-sunmoon-mask">
          <rect x="0" y="0" width="24" height="24" fill="#fff" />
          <circle className="rw-sunmoon-cut" cx="24" cy="2" r="7" fill="#000" />
        </mask>
        <circle className="rw-sunmoon-core" cx="12" cy="12" r="5" fill="currentColor" mask="url(#rw-sunmoon-mask)" />
        <g className="rw-sunmoon-rays" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 1.8v2.2M12 20v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M1.8 12H4M20 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
        </g>
      </svg>
    </Button>
  );
}

/** Inline script that applies the stored/system preference before first paint (system mode only). */
export function ModeScript({ mode }: { mode: "light" | "dark" | "system" }) {
  if (mode !== "system") return null;
  const code = `(function(){try{var s=localStorage.getItem('${KEY}');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var c=document.documentElement.classList;c.toggle('dark',d);c.toggle('light',!d);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
