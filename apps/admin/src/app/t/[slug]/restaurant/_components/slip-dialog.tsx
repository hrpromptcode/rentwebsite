"use client";

import * as React from "react";
import { ExternalLink, ImageIcon } from "lucide-react";
import { Button, type ButtonProps } from "@rentweb/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@rentweb/ui/components/dialog";

/** Shows an uploaded transfer slip in a dialog. */
export function SlipDialog({ url, label = "ดูสลิป", title = "สลิปโอนเงิน", description, ...btn }: ButtonProps & { url: string; label?: string; title?: string; description?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" {...btn} onClick={() => setOpen(true)}>
        <ImageIcon aria-hidden /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="overflow-hidden rounded-xl border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="สลิปโอนเงิน" className="mx-auto max-h-[70vh] w-auto object-contain" />
          </div>
          <Button asChild variant="ghost" size="sm" className="self-end">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden /> เปิดในแท็บใหม่
            </a>
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
