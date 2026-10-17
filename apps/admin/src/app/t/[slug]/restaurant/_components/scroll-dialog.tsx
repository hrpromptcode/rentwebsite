"use client";

import * as React from "react";
import { DialogContent, DialogFooter, DialogHeader } from "@rentweb/ui/components/dialog";
import { cn } from "@rentweb/ui/lib/utils";

/**
 * Dialog shell for the restaurant back-office that never outgrows a phone screen (RESPONSIVE_B2-02).
 * The panel is capped at the dynamic viewport height; the header (title + close button) and the footer (actions)
 * stay put and only <ScrollDialogBody> scrolls. Keeps the 16px side gutter on phones (`max-w-[calc(100%-2rem)]`)
 * — pass the desktop width as `sm:max-w-*`.
 *
 *   <ScrollDialogContent className="sm:max-w-lg">
 *     <form className={SCROLL_DIALOG_FORM}>        // optional: a form wrapping all three parts
 *       <ScrollDialogHeader>…title…</ScrollDialogHeader>
 *       <ScrollDialogBody>…fields…</ScrollDialogBody>
 *       <ScrollDialogFooter>…buttons…</ScrollDialogFooter>
 *     </form>
 *   </ScrollDialogContent>
 */
export function ScrollDialogContent({ className, children, onCloseAutoFocus, ...props }: React.ComponentProps<typeof DialogContent>) {
  // These dialogs are controlled and opened by a plain Button (no DialogTrigger), so Radix has no trigger to return focus to and
  // drops it on <body> when they close (RESPONSIVE_B2-11). Remember what had focus when the dialog opened and give it back.
  const opener = React.useRef<HTMLElement | null>(null);
  return (
    <DialogContent
      className={cn("flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0", className)}
      onCloseAutoFocus={(e) => {
        onCloseAutoFocus?.(e);
        const el = opener.current;
        opener.current = null;
        if (e.defaultPrevented || !el?.isConnected) return;
        e.preventDefault();
        el.focus();
      }}
      {...props}
    >
      <OpenerCapture into={opener} />
      {children}
    </DialogContent>
  );
}

/**
 * Mounted with the dialog's content: reads document.activeElement during its first render — before React applies
 * `autoFocus` to a field inside the dialog (commit phase) and before Radix moves focus — so it is still the opener.
 */
function OpenerCapture({ into }: { into: React.RefObject<HTMLElement | null> }) {
  React.useState(() => {
    const active = typeof document === "undefined" ? null : document.activeElement;
    into.current = active instanceof HTMLElement && active !== document.body ? active : null;
    return null;
  });
  return null;
}

/** Class for a <form> that wraps header + body + footer inside <ScrollDialogContent>. */
export const SCROLL_DIALOG_FORM = "flex min-h-0 flex-1 flex-col";

export function ScrollDialogHeader({ className, ...props }: React.ComponentProps<typeof DialogHeader>) {
  // px-12 on phones keeps the centred title clear of the 44px close button; left-aligned from sm up.
  return <DialogHeader className={cn("shrink-0 px-12 pt-6 pb-3 sm:pr-12 sm:pl-6", className)} {...props} />;
}

export function ScrollDialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-body" className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-2", className)} {...props} />;
}

export function ScrollDialogFooter({ className, ...props }: React.ComponentProps<typeof DialogFooter>) {
  return <DialogFooter className={cn("shrink-0 border-t bg-background px-6 py-4", className)} {...props} />;
}

/** After a failed submit, focus (and so scroll into view) the first invalid field of the form — it may be scrolled out of sight. */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  requestAnimationFrame(() => {
    const el = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
  });
}

/** Scrolls `ref` fully into view (inside the dialog body) whenever `when` turns true — e.g. an inline add form opened below a long list. */
export function useRevealWhen(ref: React.RefObject<HTMLElement | null>, when: boolean) {
  React.useEffect(() => {
    if (!when) return;
    const id = requestAnimationFrame(() => ref.current?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(id);
  }, [when, ref]);
}
