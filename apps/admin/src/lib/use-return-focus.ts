"use client";

import * as React from "react";

const DIALOG = '[role="dialog"],[role="alertdialog"]';

/** The focused element when it is a real control outside any dialog (else null). */
function focusedOutsideDialog(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body && !active.closest(DIALOG) ? active : null;
}

/**
 * RESPONSIVE_B2-11: Radix Dialog / Sheet only return focus to a <DialogTrigger>. Controlled dialogs opened from a
 * plain button (or a dropdown item) drop focus to <body> on close. Spread the result on <DialogContent>/<SheetContent>:
 *
 *   const returnFocus = useReturnFocus(openerRef);   // fallback ref optional
 *   <DialogContent {...returnFocus}>
 *
 * The opener is found three ways, because none works for every dialog:
 * - onOpenAutoFocus runs before Radix moves focus into the dialog, so document.activeElement is still the opener —
 *   but Radix skips it when a field inside the dialog has `autoFocus` (React focuses it first, during commit);
 * - so the hook also remembers the last control focused outside any dialog (focusin listener), for owners that stay
 *   mounted while the dialog opens and closes;
 * - and what was focused when the owner first rendered (state initializer, before commit), for owners that mount
 *   together with their dialog (`{editing && <EditDialog />}`).
 * On close focus goes back to the opener, or to `fallback` when the opener is gone (e.g. a dropdown item that unmounted).
 */
export function useReturnFocus(fallback?: React.RefObject<HTMLElement | null>) {
  const opener = React.useRef<HTMLElement | null>(null);
  // read during the first render, before React applies a child's autoFocus (same trick as restaurant ScrollDialogContent)
  const [focusedAtMount] = React.useState(focusedOutsideDialog);
  const lastOutside = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (!lastOutside.current) lastOutside.current = focusedAtMount;
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && t !== document.body && !t.closest(DIALOG)) lastOutside.current = t;
    };
    document.addEventListener("focusin", onFocusIn, true);
    return () => document.removeEventListener("focusin", onFocusIn, true);
  }, [focusedAtMount]);
  return React.useMemo(
    () => ({
      onOpenAutoFocus: () => {
        opener.current = focusedOutsideDialog();
      },
      onCloseAutoFocus: (e: Event) => {
        const remembered = opener.current ?? lastOutside.current;
        opener.current = null;
        const usable = (el: HTMLElement | null | undefined): el is HTMLElement => !!el && el.isConnected && !el.closest("[data-radix-popper-content-wrapper]");
        const target = usable(remembered) ? remembered : (fallback?.current ?? null);
        if (target && target.isConnected) {
          e.preventDefault();
          target.focus();
        }
      },
    }),
    [fallback],
  );
}
