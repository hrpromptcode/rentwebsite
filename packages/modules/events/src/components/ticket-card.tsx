import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, QrCode } from "lucide-react";
import { cn } from "@rentweb/ui/lib/utils";
import { Img } from "@rentweb/storefront";
import { L } from "../labels";
import { TicketStatusBadge, dotDate, hhmm } from "./event-card";
import { EvStyles } from "./ev-styles";
import { EvTilt } from "./ev-tilt";
import { ThaiWrap } from "./thai-wrap";
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
  event: { title: string; venueName: string | null; cover?: string | null };
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
const scriptOf = (s: string) => (/[฀-๿]/.test(s) ? (/[A-Za-z]/.test(s) ? "mixed" : "thai") : "latin");

/**
 * E-ticket (§5.10 "/tickets/*"): a perforated admission ticket — cinematic art band (event cover under a scrim, title,
 * "ADMIT ONE", status), the holder in big type, the accent-font date stamp, then a tear-off stub with the QR on a white
 * plate. CSS 3D tilt + holo foil on fine pointers only (no WebGL); pointing at the stub levels the card, touch / reduced
 * motion / print are always flat, so the QR is never skewed or tinted. Void / refunded tickets are greyed and stamped.
 * QA hooks: data-testid ticket-card / ticket-code / ticket-holder; the only data: image inside is the QR.
 */
export function TicketCard({ ticket, qrDataUrl, event, session, index, href, firstNameOnly, className }: TicketCardProps) {
  const holder = firstNameOnly ? (ticket.holderName.trim().split(/\s+/)[0] ?? ticket.holderName) : ticket.holderName;
  const inactive = dead(ticket.status);
  const used = ticket.status === "checked_in";
  return (
    <article className={cn("ev-et print:break-inside-avoid", className)} data-testid="ticket-card" data-ticket-status={ticket.status} data-dead={inactive ? "" : undefined}>
      <EvStyles />
      <EvTilt max={4} className="rounded-[inherit]">
        <div className="ev-et-body">
          {/* ---------------------------------------------------------------- main: art band + details */}
          <div className="relative min-w-0">
            <div className="ev-et-art">
              {event.cover ? <Img src={event.cover} alt="" /> : null}
              <span aria-hidden className="ev-holo" />
              <span aria-hidden className="ev-holo-lines" />
              {inactive && <span className="ev-et-stamp">{ticket.status === "refunded" ? "REFUNDED" : "VOID"}</span>}
              <div className="flex items-start justify-between gap-3">
                <p className="ev-mono text-white/75">
                  <span className="font-semibold text-primary">Admit one</span>
                  {index ? (
                    <>
                      {" · "}
                      <span data-script="thai">{index}</span>
                    </>
                  ) : null}
                </p>
                <TicketStatusBadge status={ticket.status} className="shrink-0" />
              </div>
              <div>
                <h3 className="ev-et-title" data-script={scriptOf(event.title)}>
                  <ThaiWrap text={event.title} />
                </h3>
                <p className="mt-1.5 text-sm font-medium text-primary">
                  {ticket.typeName}
                  {ticket.seatLabel ? ` · ${L.seat} ${ticket.seatLabel}` : ""}
                </p>
              </div>
            </div>

            <div className="p-5 md:p-6">
              <dl>
                <dt className="ev-mono text-muted-foreground" data-script="thai">
                  {L.holder}
                </dt>
                <dd className="font-heading mt-1 text-xl leading-snug font-semibold md:text-2xl" data-testid="ticket-holder">
                  {holder}
                </dd>
              </dl>
              <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-dashed border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] pt-5 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:gap-x-7">
                {session && (
                  <>
                    <div>
                      <dt className="ev-mono text-muted-foreground" data-script="thai">
                        {session.name ? `${L.session} ${session.name}` : L.date}
                      </dt>
                      <dd className="mt-1.5">
                        <span aria-hidden className={cn("ev-num block text-[2.1rem] leading-none font-bold", inactive ? "text-muted-foreground" : "ev-ink")}>
                          {dotDate(session.startsAt)}
                        </span>
                        <span className="mt-1.5 block text-xs text-muted-foreground">{formatThaiDate(session.startsAt)}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="ev-mono text-muted-foreground" data-script="thai">
                        {L.time}
                      </dt>
                      <dd className="mt-1.5">
                        <span className="ev-num block text-lg leading-tight font-bold">
                          {hhmm(session.startsAt)}–{hhmm(session.endsAt)}
                        </span>
                        {session.doorsOpen && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {L.doorsOpen} {formatThaiTime(session.doorsOpen)}
                          </span>
                        )}
                      </dd>
                    </div>
                  </>
                )}
                {event.venueName && (
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="ev-mono text-muted-foreground" data-script="thai">
                      {L.venue}
                    </dt>
                    <dd className="mt-1.5 text-sm leading-snug font-medium">{event.venueName}</dd>
                  </div>
                )}
                {ticket.checkedInAt && (
                  <div className="col-span-2 text-emerald-700 sm:col-span-3 dark:text-emerald-300">
                    <dt className="ev-mono inline-flex items-center gap-1.5" data-script="thai">
                      <CheckCircle2 className="size-3.5" aria-hidden /> {L.checkedInAt}
                    </dt>
                    <dd className="mt-1 text-sm font-medium">{formatThaiDateTime(ticket.checkedInAt)}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* ---------------------------------------------------------------- tear-off stub: QR (always flat) */}
          <div className="ev-et-stub" data-tilt-flat="">
            {qrDataUrl ? (
              <span className={cn("ev-et-qr", used && "opacity-90")}>
                <img src={qrDataUrl} alt={`QR ${ticket.code}`} width={216} height={216} className={cn(inactive && "grayscale")} />
              </span>
            ) : (
              <span className="ev-et-qr flex items-center justify-center text-[#0b0b0f]/40" aria-hidden>
                <span className="flex aspect-square w-[min(13.5rem,62vw)] items-center justify-center md:w-[11.5rem]">
                  <QrCode className="size-12" />
                </span>
              </span>
            )}
            <p className="ev-et-code text-foreground" data-testid="ticket-code">
              {ticket.code}
            </p>
            <p className="text-center text-xs leading-relaxed text-muted-foreground">{inactive ? L.ticketDead : L.showQr}</p>
            {href && !inactive && (
              <Link href={href} className="group inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-primary transition hover:bg-primary/10 print:hidden">
                {L.openTicket}
                <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </EvTilt>
    </article>
  );
}
