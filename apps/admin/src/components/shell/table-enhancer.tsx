"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Sticky table headers without nested scroll areas. The shared <Table> wraps every table in an `overflow-x-auto`
 * container (needed on phones), which would trap `position: sticky` inside it. This watcher marks containers whose
 * table fits (`data-fit="1"`), and the admin CSS lets only those overflow visibly so their <th> stick under the topbar
 * while the page scrolls. Tables that need horizontal scroll keep it. Re-checks on resize and on DOM changes in <main>.
 */
export function TableEnhancer() {
  const pathname = usePathname();
  React.useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const seen = new WeakSet<Element>();
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const box = (e.target as HTMLElement).closest<HTMLElement>('[data-slot="table-container"]');
        if (box) check(box);
      }
    });
    function check(el: HTMLElement) {
      const table = el.querySelector("table");
      if (!table) return;
      const fits = table.scrollWidth <= el.clientWidth + 1;
      const v = fits ? "1" : "0";
      if (el.dataset.fit !== v) el.dataset.fit = v;
    }
    function scan() {
      main!.querySelectorAll<HTMLElement>('[data-slot="table-container"]').forEach((el) => {
        if (!seen.has(el)) {
          seen.add(el);
          ro.observe(el);
          const t = el.querySelector("table");
          if (t) ro.observe(t);
        }
        check(el);
      });
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
      mo.disconnect();
      ro.disconnect();
    };
  }, [pathname]);
  return null;
}
