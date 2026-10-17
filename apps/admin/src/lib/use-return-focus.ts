"use client";

import * as React from "react";

/**
 * RESPONSIVE_B2-11: Radix Dialog / Sheet only return focus to a <DialogTrigger>. Controlled dialogs opened from a
 * plain button (or a dropdown item) drop focus to <body> on close. Spread the result on <DialogContent>/<SheetContent>:
 *
 *   const returnFocus = useReturnFocus(openerRef);   // fallback ref optional
 *   <DialogContent {...returnFocus}>
 *
 * onOpenAutoFocus runs before Radix moves focus into the dialog, so document.activeElement is still the opener.
 * On close focus goes back to it, or to `fallback` when the opener is gone (e.g. a dropdown item that unmounted).
 */
export function useReturnFocus(fallback?: React.RefObject<HTMLElement | null>) {
  const opener = React.useRef<HTMLElement | null>(null);
  return React.useMemo(
    () => ({
      onOpenAutoFocus: () => {
        const active = typeof document !== "undefined" ? document.activeElement : null;
        opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      },
      onCloseAutoFocus: (e: Event) => {
        const remembered = opener.current;
        opener.current = null;
        const target = remembered && remembered.isConnected && !remembered.closest("[data-radix-popper-content-wrapper]") ? remembered : (fallback?.current ?? null);
        if (target && target.isConnected) {
          e.preventDefault();
          target.focus();
        }
      },
    }),
    [fallback],
  );
}
