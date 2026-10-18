import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronLeft, Info, XCircle } from "lucide-react";
import { Button } from "@rentweb/ui/components/button";
import { Reveal } from "@rentweb/ui/motion";
import { getTicketByCode, getTicketDetail, isSignedTicketPayload, ticketQrDataUrl, verifyTicketPayload } from "@rentweb/module-events/services";
import { L, TicketCard, formatThaiDateTime } from "@rentweb/module-events/ui";
import { TicketTools } from "@rentweb/module-events/client";
import { decodeSlug } from "@/lib/slug";
import { getRuntime, tenantTx } from "@/lib/tenant";
import { PageBody } from "@/components/page-body";

type Params = Promise<{ tenantId: string; code: string }>;

export const metadata: Metadata = { title: "บัตรเข้างาน", robots: { index: false, follow: false } };

/**
 * /tickets/t/[code] – one ticket by its signed QR payload (RWT1.tenant.ticket.code.hmac) or its unguessable code.
 * Public (shareable with the attendee); shows the holder's first name only and no buyer contact details.
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
      ? { icon: CheckCircle2, tone: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10", text: `${L.checkedInAt} ${detail.ticket.checkedInAt ? formatThaiDateTime(detail.ticket.checkedInAt) : ""}` }
      : detail.ticket.status === "valid"
        ? { icon: Info, tone: "text-primary bg-primary-soft", text: L.publicTicketHint }
        : { icon: XCircle, tone: "text-destructive bg-destructive/10", text: detail.ticket.status === "refunded" ? L.refundedHint : L.ticketNotFoundHint };

  return (
    <PageBody theme={runtime.theme} sections={[]}>
      <section className="container-x pt-8 pb-16 md:pt-12 md:pb-24">
        <div className="mx-auto max-w-2xl">
          <Link href={eventHref} className="inline-flex h-11 items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground print:hidden">
            <ChevronLeft className="size-4" /> {L.backToEvent}
          </Link>
          <Reveal className="mt-2">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">{runtime.config.name}</p>
            <h1 className="font-heading mt-1 text-3xl font-semibold md:text-4xl">{L.publicTicketTitle}</h1>
          </Reveal>
          <Reveal delay={0.05} className={`mt-5 flex items-start gap-2 rounded-[var(--radius-lg)] p-3 text-sm ${note.tone}`} role="status" data-testid="public-ticket-note">
            <note.icon className="mt-0.5 size-4 shrink-0" aria-hidden /> <span>{note.text}</span>
          </Reveal>
          <Reveal delay={0.1} className="mt-5">
            <TicketCard ticket={{ id: detail.ticket.id, code: detail.ticket.code, holderName: detail.ticket.holderName, status: detail.ticket.status, typeName: detail.typeName, seatLabel: detail.ticket.seatLabel, checkedInAt: detail.ticket.checkedInAt }} qrDataUrl={qr} event={{ title: detail.event.title, venueName: detail.event.venueName }} session={detail.session} firstNameOnly />
          </Reveal>
          {live && (
            <Reveal delay={0.15} className="mt-5">
              <TicketTools shareUrl={selfHref} shareTitle={`${detail.event.title} – ${detail.ticket.code}`} />
            </Reveal>
          )}
          <div className="mt-8 print:hidden">
            <Button asChild variant="outline" size="lg">
              <Link href={eventHref}>{L.viewEvent}</Link>
            </Button>
          </div>
        </div>
      </section>
    </PageBody>
  );
}
