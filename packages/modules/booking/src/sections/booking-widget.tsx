import * as React from "react";
import type { z } from "zod";
import { cookies } from "next/headers";
import { getDb, withTenant, type Tx } from "@rentweb/db";
import { CUSTOMER_COOKIE, getCustomerByToken, type CustomerSummary } from "@rentweb/core/customer";
import { enabledMethods } from "@rentweb/core/payments";
import type { StorefrontCtx } from "@rentweb/storefront/ctx";
import type { bookingWidget } from "@rentweb/storefront/definitions";
import { Section, SectionHeading } from "@rentweb/storefront";
import type { PaymentMethodOption } from "@rentweb/storefront/payments";
import { BookingWizard, type WizardCourse, type WizardService, type WizardStaff } from "../components/booking-wizard";
import { FloatingChatOptOut } from "../components/floating-chat-opt-out";
import { listServices, listStaff } from "../services/catalog";
import { getPatientPackageForCustomer } from "../services/clinic";
import { bookingConfig, type BookingConfig } from "../services/config";
import { addDays, bkkDateString, parseYmd, ymdToString } from "../services/time";
import { METHOD_LABELS } from "../labels";

type Props = z.output<typeof bookingWidget.schema>;

export async function loadWizardData(tx: Tx, tenantId: string): Promise<{ services: WizardService[]; staff: WizardStaff[] }> {
  const [svc, team] = await Promise.all([listServices(tx, tenantId), listStaff(tx, tenantId, { onlineOnly: true })]);
  return {
    services: svc.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      description: s.description,
      image: s.image,
      durationMin: s.durationMin,
      price: s.price,
      priceNote: s.priceNote,
      depositRequired: s.depositRequired,
      depositAmount: s.depositAmount,
      capacity: s.capacity,
      requiresStaff: s.requiresStaff,
      seatsPerBooking: s.seatsPerBooking ?? null,
      featured: s.featured,
      categoryName: s.categoryName,
    })),
    staff: team.map((t) => ({ id: t.id, slug: t.slug, name: t.name, title: t.title, avatar: t.avatar, color: t.color, serviceIds: t.serviceIds })),
  };
}

/** Payment methods the tenant accepts, with Thai labels, for the deposit step. */
export function depositMethodOptions(settings: Record<string, unknown>): PaymentMethodOption[] {
  return enabledMethods(settings)
    .filter((m) => m in METHOD_LABELS && m !== "cod" && m !== "wallet")
    .map((m) => ({ value: m, label: METHOD_LABELS[m]!.label, description: METHOD_LABELS[m]!.description || undefined }));
}

export function wizardDates(config: BookingConfig, now = new Date()): { today: string; maxDate: string } {
  const today = bkkDateString(now);
  return { today, maxDate: ymdToString(addDays(parseYmd(today)!, config.maxAdvanceDays)) };
}

/** Signed-in storefront customer (for prefill) – sections have no customer in ctx, so read the cookie here. */
async function currentCustomer(tx: Tx, tenantId: string): Promise<CustomerSummary | null> {
  try {
    const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
    return token ? await getCustomerByToken(tx, tenantId, token) : null;
  } catch {
    return null;
  }
}

export interface BookingWidgetExtra {
  /** preselect by id or slug (?service= / ?staff= on /book); package = patient package id (?package=, SBR-016) */
  preselect?: { service?: string | null; staff?: string | null; package?: string | null };
  /** render without the Section wrapper (used by the /book page) */
  bare?: boolean;
}

export async function BookingWidgetSection({ ctx, props: p, id, preselect, bare }: { ctx: StorefrontCtx; props: Props; id: string; index: number } & BookingWidgetExtra) {
  const tenantId = ctx.tenant.id;
  const config = bookingConfig(ctx.tenant.moduleConfig);
  const { services, staff, customer, course } = await withTenant(getDb(), tenantId, async (tx) => {
    const data = await loadWizardData(tx, tenantId);
    const customer = await currentCustomer(tx, tenantId);
    // SBR-016: a course the signed-in customer can redeem (validated again by createBooking)
    let course: WizardCourse | null = null;
    if (customer && preselect?.package) {
      const item = await getPatientPackageForCustomer(tx, tenantId, preselect.package, customer).catch(() => null);
      if (item && item.status === "active" && !item.isExpired && item.sessionsLeft > 0 && (!item.serviceId || data.services.some((s) => s.id === item.serviceId))) {
        course = { id: item.id, name: item.packageName, sessionsLeft: item.sessionsLeft, serviceId: item.serviceId };
      }
    }
    return { ...data, customer, course };
  });
  const { today, maxDate } = wizardDates(config);
  const wantService = course?.serviceId ?? preselect?.service ?? p.serviceSlug ?? null;
  const svc = wantService ? services.find((s) => s.id === wantService || s.slug === wantService) : undefined;
  const st = preselect?.staff ? staff.find((s) => s.id === preselect.staff || s.slug === preselect.staff) : undefined;

  const wizard = (
    <BookingWizard
      services={services}
      staff={staff}
      config={{ slotMinutes: config.slotMinutes, minNoticeHours: config.minNoticeHours, maxAdvanceDays: config.maxAdvanceDays, cancelHours: config.cancelHours, depositEnabled: config.depositEnabled }}
      today={today}
      maxDate={maxDate}
      customer={customer ? { name: customer.name, phone: customer.phone, email: customer.email } : null}
      preselect={{ serviceId: svc?.id ?? null, staffId: st?.id ?? null }}
      paymentMethods={depositMethodOptions(ctx.tenant.settings)}
      course={course}
      compact={p.compact}
    />
  );

  if (bare) return wizard;
  return (
    <Section id={id} tone={p.compact ? "default" : "surface"}>
      <div className={p.compact ? "container-x max-w-3xl" : "container-x"}>
        <SectionHeading heading={p.heading} subheading={p.subheading} />
        {/* embedded on a home page: no floating LINE button over the calendar while the widget is on a phone screen */}
        <FloatingChatOptOut>{wizard}</FloatingChatOptOut>
      </div>
    </Section>
  );
}
