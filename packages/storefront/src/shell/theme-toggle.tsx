"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
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
  };
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? labels.light : labels.dark} className="text-current md:size-9">
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}

/** Inline script that applies the stored/system preference before first paint (system mode only). */
export function ModeScript({ mode }: { mode: "light" | "dark" | "system" }) {
  if (mode !== "system") return null;
  const code = `(function(){try{var s=localStorage.getItem('${KEY}');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var c=document.documentElement.classList;c.toggle('dark',d);c.toggle('light',!d);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
