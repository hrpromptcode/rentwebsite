"use client";

import * as React from "react";

export interface CompareRow {
  label: string;
  values: string[];
}

/**
 * Plan comparison (§4.7): sticky header row, zebra rows in `surface`; below 768px a plan selector switches the
 * visible column instead of scrolling sideways.
 */
export function CompareTable({ plans, rows, caption }: { plans: { key: string; name: string; hot?: boolean }[]; rows: CompareRow[]; caption: string }) {
  const [col, setCol] = React.useState(Math.max(0, plans.findIndex((p) => p.hot)));
  return (
    <div>
      <div role="tablist" aria-label="เลือกแพ็กเกจที่จะดู" className="mb-6 grid grid-cols-3 gap-1 rounded-full border border-border bg-card p-1 md:hidden">
        {plans.map((p, i) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={i === col}
            onClick={() => setCol(i)}
            className="min-h-11 rounded-full text-sm font-semibold transition-colors aria-selected:bg-foreground aria-selected:text-background"
          >
            {p.name}
          </button>
        ))}
      </div>
      <table className="w-full border-separate border-spacing-0 text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky top-[var(--header-h)] z-10 border-b border-border bg-background py-5 pr-4 text-sm font-semibold text-muted-foreground">
              ขีดจำกัด
            </th>
            {plans.map((p, i) => (
              <th
                key={p.key}
                scope="col"
                className={`sticky top-[var(--header-h)] z-10 border-b border-border bg-background px-4 py-5 font-accent text-step-1 font-semibold tracking-[-0.02em] ${i === col ? "" : "hidden md:table-cell"}`}
              >
                <span className="inline-flex items-center gap-2">
                  {p.name}
                  {p.hot ? <span className="rounded-full bg-primary px-2 py-0.5 font-body text-[0.7rem] text-primary-foreground">ยอดนิยม</span> : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.label} className={ri % 2 === 0 ? "bg-surface" : ""}>
              <th scope="row" className="rounded-l-xl py-4 pl-4 pr-4 text-[0.95rem] font-medium">
                {r.label}
              </th>
              {r.values.map((v, i) => (
                <td key={i} className={`px-4 py-4 font-mono text-[0.95rem] last:rounded-r-xl ${i === col ? "" : "hidden md:table-cell"}`}>
                  {v === "∞" ? (
                    <span className="text-xl leading-none text-primary" aria-label="ไม่จำกัด">
                      ∞
                    </span>
                  ) : (
                    v
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
