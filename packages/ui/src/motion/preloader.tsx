import * as React from "react";
import { scriptOf, splitGraphemes } from "./split";
import { PreloaderClient } from "./preloader-client";

export interface PreloaderProps {
  /** brand name (logoText ?? tenant name) */
  brand: string;
  /** tenant logo (shown instead of the assembled wordmark in the "wordmark" variant when given) */
  logoUrl?: string;
  /** counter: mono 000→100 + brand · wordmark: brand assembles letter by letter · curtain: plain curtain lift */
  variant?: "counter" | "wordmark" | "curtain";
  /** minimum time on screen (ms) */
  minMs?: number;
  /** hard cap (ms): the overlay is gone by then, whatever happens */
  maxMs?: number;
  /** sessionStorage key: shows once per session */
  onceKey?: string;
  /** pathnames that may show it (default only the home page "/") */
  paths?: string[];
  /** allow `?preloader=force` to show it regardless of session / automation (lab + QA screenshots) */
  allowForce?: boolean;
}

/**
 * First-visit preloader (§2.6). Render it as the FIRST child of <body> from a server layout: an inline script decides
 * before first paint (home page only, once per session, JS on, no reduced motion, no Save-Data, not a bot /
 * automation) and injects a tiny <style> into <head> that makes the overlay visible (plus window.__rwPreloader="on") —
 * no attribute on <html>/<body> before hydration (React would report a mismatch), repeat visits never flash it and
 * crawlers / no-JS never see it. Content is server-rendered underneath (LCP unaffected), the
 * overlay is aria-hidden, stops catching clicks when it exits and is removed by `maxMs` even if hydration fails.
 * When done: html[data-preloaded], `rw:preloaded` window event (SplitReveal trigger="mount" waits for it).
 */
export function Preloader({ brand, logoUrl, variant = "counter", minMs = 600, maxMs = 1200, onceKey = "rw-preloaded", paths = ["/"], allowForce = false }: PreloaderProps) {
  const script = `(function(){try{var w=window,k=${JSON.stringify(onceKey)},q=location.search||"";var force=${allowForce ? "q.indexOf('preloader=force')>-1" : "false"};if(!force){if(${JSON.stringify(paths)}.indexOf(location.pathname)<0)return;if(sessionStorage.getItem(k))return;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;var c=navigator.connection;if(c&&c.saveData)return;if(navigator.webdriver||/bot|crawl|spider|slurp|lighthouse|headless/i.test(navigator.userAgent))return;}w.__rwPreloader='on';var s=document.createElement('style');s.id='rw-preloader-css';s.textContent='.rw-preloader{display:flex!important}';document.head.appendChild(s);setTimeout(function(){if(w.__rwPreloader==='on'){w.__rwPreloader='done';s.remove();try{sessionStorage.setItem(k,'1')}catch(e){}w.dispatchEvent(new Event('rw:preloaded'))}},${maxMs + 900});}catch(e){}})();`;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <PreloaderClient
        brand={brand}
        parts={splitGraphemes(brand)}
        script={scriptOf(brand)}
        logoUrl={logoUrl}
        variant={variant}
        minMs={minMs}
        maxMs={maxMs}
        onceKey={onceKey}
      />
    </>
  );
}
