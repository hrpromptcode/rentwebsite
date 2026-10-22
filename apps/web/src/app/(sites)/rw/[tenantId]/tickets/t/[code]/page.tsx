import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Info, XCircle } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { getTicketByCode, getTicketDetail, isSignedTicketPayload, ticketQrDataUrl, verifyTicketPayload } from "@rentweb/module-events/services";
import { EvStyles, L, TicketCard, formatThaiDateTime } from "@rentweb/module-events/ui";
import { TicketTools } from "@rentweb/module-events/client";
import { decodeSlug } from "@/lib/slug";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";
import { FloatingChatOptOut } from "@rentweb/storefront";

type Params = Promise<{ tenantId: string; code: string }>;

export const metadata: Metadata = { title: "บัตรเข้างาน", robots: { index: false, follow: false } };

/**
 * /tickets/t/[code] – one ticket by its signed QR payload (RWT1.tenant.ticket.code.hmac) or its unguessable code.
 * Public (shareable with the attendee); shows the holder's first name only and no buyer contact details.
 * Operational (§5.10 "/tickets/*"): the e-ticket under a static stage glow, CSS tilt + holo, QR always flat.
 */
export default async function PublicTicketPage({ params }: { params: Params }) {
  const { tenantId, code: raw } = await params;
  const code = decodeSlug(raw).trim();
  const runtime = await getRuntime(tenantId);
  if (!runtime || !runtime.config.modules.includes("events")) notFound();
  const detail = await tenantTx(tenantId, async (tx) => {
    if (isSignedTicketPayload(code)) {
      const p = verifyTicketPayload(code);
      if (!p || p.tenantId !== tenantId) return null;
      const d = await getTicketDetail(tx, tenantId, p.ticketId);
      return d && d.ticket.code === p.code ? d : null;
    }
    const t = await getTicketByCode(tx, tenantId, code);
    return t ? getTicketDetail(tx, tenantId, t.id) : null;
  });
  if (!detail) notFound();
  const live = detail.ticket.status === "valid" || detail.ticket.status === "checked_in";
  const qr = live ? await ticketQrDataUrl(detail.qrPayload, { width: 384 }) : null;
  const selfHref = `/tickets/t/${encodeURIComponent(detail.qrPayload)}`;
  const eventHref = `/events/${encodeURIComponent(detail.event.slug)}`;
  const note =
    detail.ticket.status === "checked_in"
      ? { icon: CheckCircle2, tone: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/25", text: `${L.checkedInAt} ${detail.ticket.checkedInAt ? formatThaiDateTime(detail.ticket.checkedInAt) : ""}` }
      : detail.ticket.status === "valid"
        ? { icon: Info, tone: "text-foreground bg-primary-soft border-[color-mix(in_oklab,var(--primary)_30%,transparent)]", text: L.publicTicketHint }
        : { icon: XCircle, tone: "text-destructive bg-destructive/10 border-destructive/25", text: detail.ticket.status === "refunded" ? L.refundedHint : L.ticketNotFoundHint };

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <EvStyles />
      <section className="container-x relative isolate pt-6 pb-16 md:pt-10 md:pb-24">
        <div aria-hidden className="ev-spot print:hidden" />
        <div className="mx-auto max-w-3xl">
          <Link href={eventHref} className="group inline-flex h-11 items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground print:hidden">
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" aria-hidden /> {L.backToEvent}
          </Link>
          <header className="ev-fade mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <p className="ev-mono text-muted-foreground">
                <span className="text-primary">●</span> {runtime.config.name}
              </p>
              <h1 className="font-heading mt-2 text-step-4 leading-tight font-semibold">{L.publicTicketTitle}</h1>
            </div>
            <p aria-hidden className="font-mono text-sm font-semibold tracking-[0.18em] text-muted-foreground">
              {detail.ticket.code}
            </p>
          </header>
          <p className={`ev-fade mt-6 flex items-start gap-2.5 rounded-[var(--radius-lg)] border px-4 py-3 text-sm leading-relaxed ${note.tone}`} style={{ "--d": ".06s" } as React.CSSProperties} role="status" data-testid="public-ticket-note">
            <note.icon className="mt-0.5 size-4 shrink-0" aria-hidden /> <span>{note.text}</span>
          </p>
          {/* phones: the floating LINE button must never sit on the QR the door staff scan */}
          <FloatingChatOptOut>
          <div className="ev-fade mt-6" style={{ "--d": ".12s" } as React.CSSProperties}>
            <TicketCard
              ticket={{ id: detail.ticket.id, code: detail.ticket.code, holderName: detail.ticket.holderName, status: detail.ticket.status, typeName: detail.typeName, seatLabel: detail.ticket.seatLabel, checkedInAt: detail.ticket.checkedInAt }}
              qrDataUrl={qr}
              event={{ title: detail.event.title, venueName: detail.event.venueName, cover: detail.event.cover }}
              session={detail.session}
              firstNameOnly
            />
          </div>
          </FloatingChatOptOut>
          <div className="ev-fade mt-6 flex flex-wrap items-center justify-between gap-3 print:hidden" style={{ "--d": ".18s" } as React.CSSProperties}>
            {live ? <TicketTools shareUrl={selfHref} shareTitle={`${detail.event.title} – ${detail.ticket.code}`} /> : <span />}
            <Button asChild variant="ghost" size="lg" className="group h-11 rounded-full">
              <Link href={eventHref}>
                {L.viewEvent} <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </PageBody>
  );
}
