"use client";

import * as React from "react";
import { CalendarPlus, Check, Link2, Printer, Share2 } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { cn } from "@rentweb/ui/lib/utils";
import { L } from "../labels";

export interface TicketToolsProps {
  /** absolute or site-relative URL of the page to share */
  shareUrl: string;
  shareTitle: string;
  /** .ics download href (null hides the button) */
  icsHref?: string | null;
  icsFilename?: string;
  className?: string;
}

/** Add-to-calendar, share (Web Share API → copy link fallback) and print buttons for the order / ticket pages. */
export function TicketTools({ shareUrl, shareTitle, icsHref, icsFilename, className }: TicketToolsProps) {
  const [copied, setCopied] = React.useState(false);
  const [canShare, setCanShare] = React.useState(false);
  React.useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const absolute = () => (shareUrl.startsWith("http") ? shareUrl : `${window.location.origin}${shareUrl}`);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(absolute());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked – nothing else to do */
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: shareTitle, url: absolute() });
    } catch {
      /* user dismissed */
    }
  };

  return (
    <div className={cn("flex flex-wrap gap-2 print:hidden", className)} data-testid="ticket-tools">
      {icsHref && (
        <Button asChild variant="outline" className="h-11">
          <a href={icsHref} download={icsFilename ?? "event.ics"} data-testid="ics-link">
            <CalendarPlus className="size-4" /> {L.addToCalendar}
          </a>
        </Button>
      )}
      {canShare ? (
        <Button type="button" variant="outline" className="h-11" onClick={share}>
          <Share2 className="size-4" /> {L.share}
        </Button>
      ) : (
        <Button type="button" variant="outline" className="h-11" onClick={copy} aria-live="polite">
          {copied ? <Check className="size-4 text-emerald-600" /> : <Link2 className="size-4" />} {copied ? L.copied : L.copyLink}
        </Button>
      )}
      <Button type="button" variant="outline" className="h-11" onClick={() => window.print()}>
        <Printer className="size-4" /> {L.print}
      </Button>
    </div>
  );
}
