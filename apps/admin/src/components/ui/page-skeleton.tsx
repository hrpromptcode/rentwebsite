import * as React from "react";

/**
 * Route-level loading placeholder for the admin workspace (loading.tsx): header bars, a KPI strip and a list card with
 * shimmering rows. Pure decoration — aria-busy wrapper with one sr-only status line, no headings / tables / list items /
 * progressbars, so QA locators never match the placeholder instead of the real page.
 */
export function PageSkeleton({ kpis = true }: { kpis?: boolean }) {
  return (
    <div aria-busy="true" className="space-y-8">
      <span className="sr-only" role="status">
        กำลังโหลด…
      </span>
      <div aria-hidden="true" className="space-y-3">
        <div className="adm-skel h-3.5 w-40" />
        <div className="adm-skel h-9 w-[min(22rem,80%)] rounded-xl" />
        <div className="adm-skel h-3.5 w-[min(30rem,90%)]" />
      </div>
      {kpis && (
        <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card space-y-4 p-4 sm:p-5">
              <div className="flex items-center gap-2.5">
                <div className="adm-skel size-8 rounded-[0.625rem]" />
                <div className="adm-skel h-3 w-20" />
              </div>
              <div className="adm-skel h-7 w-24 rounded-lg" />
              <div className="adm-skel h-8 w-full rounded-lg opacity-60" />
            </div>
          ))}
        </div>
      )}
      <div aria-hidden="true" className="card overflow-hidden py-0">
        <div className="flex items-center gap-4 border-b px-4 py-3.5">
          <div className="adm-skel h-3 w-24" />
          <div className="adm-skel ml-auto h-3 w-16" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0" style={{ opacity: 1 - i * 0.12 }}>
            <div className="adm-skel size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="adm-skel h-3 w-[min(14rem,60%)]" />
              <div className="adm-skel h-2.5 w-[min(9rem,40%)] opacity-70" />
            </div>
            <div className="adm-skel hidden h-3 w-20 sm:block" />
            <div className="adm-skel h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
