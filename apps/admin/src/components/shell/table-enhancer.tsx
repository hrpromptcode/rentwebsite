"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Sticky table headers without nested scroll areas. The shared <Table> wraps every table in an `overflow-x-auto`
 * container (needed on phones), which would trap `position: sticky` inside it. This watcher marks containers whose
 * table fits (`data-fit="1"`), and the admin CSS lets only those overflow visibly so their <th> stick under the topbar
 * while the page scrolls. Tables that need horizontal scroll keep it. Re-checks on resize and on DOM changes in <main>.
 * A container is only marked once React has hydrated it: pages behind a loading.tsx boundary stream in (and the
 * MutationObserver sees them) before their Suspense boundary hydrates, and touching their attributes earlier would be a
 * hydration mismatch. Unhydrated containers are retried on a short timer.
 */
const isHydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith("__reactFiber$"));

export function TableEnhancer() {
  const pathname = usePathname();
  React.useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const seen = new WeakSet<Element>();
    let retry = 0;
    let tries = 0;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const box = (e.target as HTMLElement).closest<HTMLElement>('[data-slot="table-container"]');
        if (box) check(box);
      }
    });
    function check(el: HTMLElement): boolean {
      if (!isHydrated(el)) return false;
      const table = el.querySelector("table");
      if (!table) return true;
      const fits = table.scrollWidth <= el.clientWidth + 1;
      const v = fits ? "1" : "0";
      if (el.dataset.fit !== v) el.dataset.fit = v;
      return true;
    }
    function scan() {
      let pending = false;
      main!.querySelectorAll<HTMLElement>('[data-slot="table-container"]').forEach((el) => {
        if (!check(el)) {
          pending = true;
          return;
        }
        if (!seen.has(el)) {
          seen.add(el);
          ro.observe(el);
          const t = el.querySelector("table");
          if (t) ro.observe(t);
        }
      });
      window.clearTimeout(retry);
      if (pending && tries++ < 60) retry = window.setTimeout(scan, 200);
      else if (!pending) tries = 0;
    }
    let raf = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(scan);
    });
    scan();
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(retry);
      mo.disconnect();
      ro.disconnect();
    };
  }, [pathname]);
  return null;
}
