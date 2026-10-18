import * as React from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, DoorOpen, MapPin, QrCode, User } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { L } from "../labels";
import { TicketStatusBadge } from "./event-card";
import { formatThaiDate, formatThaiDateTime, formatThaiTime } from "../services/time";

export interface TicketCardData {
  id: string;
  code: string;
  holderName: string;
  status: string;
  typeName: string;
  seatLabel: string | null;
  checkedInAt: Date | null;
}

export interface TicketCardProps {
  ticket: TicketCardData;
  /** PNG data URL of the signed QR payload (rendered on the server with ticketQrDataUrl) */
  qrDataUrl: string | null;
  event: { title: string; venueName: string | null };
  session: { name: string | null; startsAt: Date; endsAt: Date; doorsOpen: Date | null } | null;
  /** "ใบที่ 1/3" */
  index?: string;
  /** link to the public single-ticket page */
  href?: string | null;
  /** show only the holder's first name (public ticket view) */
  firstNameOnly?: boolean;
  className?: string;
}

const dead = (status: string) => status === "void" || status === "refunded";

/**
 * E-ticket: QR on the left (or on top on phones), event / session / holder on the right, perforated edge,
 * dimmed with a stamp when void / refunded, a green check when already checked in. Prints cleanly (print:break-inside-avoid).
 */
export function TicketCard({ ticket, qrDataUrl, event, session, index, href, firstNameOnly, className }: TicketCardProps) {
  const holder = firstNameOnly ? (ticket.holderName.trim().split(/\s+/)[0] ?? ticket.holderName) : ticket.holderName;
  const inactive = dead(ticket.status);
  return (
    <article className={cn("card relative overflow-hidden p-0 print:break-inside-avoid print:shadow-none", inactive && "opacity-70", className)} data-testid="ticket-card" data-ticket-status={ticket.status}>
      <div className="grid sm:grid-cols-[200px_minmax(0,1fr)]">
        {/* QR side */}
        <div className="relative flex flex-col items-center justify-center gap-2 border-b border-dashed border-border bg-muted/40 p-5 sm:border-r sm:border-b-0">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR ${ticket.code}`} width={168} height={168} className={cn("size-[168px] rounded-[var(--radius-md)] bg-white p-1.5", inactive && "grayscale")} />
          ) : (
            <span className="flex size-[168px] items-center justify-center rounded-[var(--radius-md)] bg-white text-muted-foreground">
              <QrCode className="size-10" aria-hidden />
            </span>
          )}
          <p className="font-mono text-sm font-semibold tracking-[0.15em] text-foreground" data-testid="ticket-code">
            {ticket.code}
          </p>
          {inactive && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xl font-bold tracking-[0.3em] text-destructive/80 uppercase [transform:rotate(-14deg)]">{ticket.status === "refunded" ? "REFUNDED" : "VOID"}</span>}
          {/* perforation notches */}
          <span aria-hidden className="absolute -right-3 -bottom-3 hidden size-6 rounded-full bg-background sm:block" />
          <span aria-hidden className="absolute -top-3 -right-3 hidden size-6 rounded-full bg-background sm:block" />
        </div>
        {/* details */}
        <div className="flex flex-col p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-[0.2em] text-primary-ink uppercase">{index ?? L.eTickets}</p>
            <TicketStatusBadge status={ticket.status} />
          </div>
          <h3 className="font-heading mt-1 text-xl font-semibold leading-snug">{event.title}</h3>
          <p className="mt-1 text-sm font-medium text-primary">
            {ticket.typeName}
            {ticket.seatLabel ? ` · ${L.seat} ${ticket.seatLabel}` : ""}
          </p>
          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex items-start gap-2">
              <User className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div>
                <dt className="text-xs text-muted-foreground">{L.holder}</dt>
                <dd className="font-medium" data-testid="ticket-holder">
                  {holder}
                </dd>
              </div>
            </div>
            {session && (
              <div className="flex items-start gap-2">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div>
                  <dt className="text-xs text-muted-foreground">{session.name ? `${L.session} ${session.name}` : L.when}</dt>
                  <dd className="font-medium">
                    {formatThaiDate(session.startsAt, "long")} · {formatThaiTime(session.startsAt)}–{formatThaiTime(session.endsAt)}
                  </dd>
                  {session.doorsOpen && (
                    <dd className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <DoorOpen className="size-3.5" aria-hidden /> {L.doorsOpen} {formatThaiTime(session.doorsOpen)}
                    </dd>
                  )}
                </div>
              </div>
            )}
            {event.venueName && (
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div>
                  <dt className="text-xs text-muted-foreground">{L.venue}</dt>
                  <dd className="font-medium">{event.venueName}</dd>
                </div>
              </div>
            )}
            {ticket.checkedInAt && (
              <div className="flex items-start gap-2 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div>
                  <dt className="text-xs opacity-80">{L.checkedInAt}</dt>
                  <dd className="font-medium">{formatThaiDateTime(ticket.checkedInAt)}</dd>
                </div>
              </div>
            )}
          </dl>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
            <span>{L.showQr}</span>
            {href && !inactive && (
              <Link href={href} className="inline-flex min-h-11 items-center text-primary hover:underline print:hidden">
                {L.openTicket}
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
