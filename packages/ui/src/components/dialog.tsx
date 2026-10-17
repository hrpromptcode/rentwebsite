"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { cn } from "../lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Dialog panel. Never taller than the screen (RESPONSIVE_B2-02 / restaurant_admin_b4 follow-up): capped at
 * `100dvh - 2rem` and the panel itself scrolls. For a header / footer that stay put while only the middle scrolls,
 * put the scrolling part in <DialogBody> (directly or inside a <form className="contents">-style wrapper):
 *
 *   <DialogContent>
 *     <DialogHeader>…</DialogHeader>
 *     <DialogBody>…long fields…</DialogBody>
 *     <DialogFooter>…actions…</DialogFooter>
 *   </DialogContent>
 *
 * A DialogBody anywhere inside switches the panel to a flex column with `overflow-hidden` (CSS :has), so the close
 * button, header and footer never scroll away. Phones keep a 16px gutter even when a consumer passes a bare
 * `max-w-*` (use `sm:max-w-*` for the desktop width).
 */
function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showClose?: boolean }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border bg-background p-6 shadow-2xl duration-200 max-sm:max-w-[calc(100%-2rem)] sm:max-w-lg",
          "max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain",
          "has-[[data-slot=dialog-body]]:flex has-[[data-slot=dialog-body]]:flex-col has-[[data-slot=dialog-body]]:overflow-hidden",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close className="absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:outline-hidden [&_svg]:size-4">
            <XIcon />
            <span className="sr-only">ปิด</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex shrink-0 flex-col gap-1.5 text-center sm:text-left", className)} {...props} />;
}

/** The scrolling middle of a dialog (see DialogContent): header and footer stay visible, only this part scrolls. */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-body" className={cn("-mx-6 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("font-heading text-lg font-semibold leading-none", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger };
