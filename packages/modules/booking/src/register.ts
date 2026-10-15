/**
 * Side-effect module: registers storefront section components and payment handlers.
 * Imported once by apps/web/src/modules.ts.
 */
import { registerSection } from "@rentweb/storefront";
import { registerPaymentHandler } from "@rentweb/core/payments";
import { BookingWidgetSection } from "./sections/booking-widget";
import { ServiceListSection } from "./sections/service-list";
import { StaffGridSection } from "./sections/staff-grid";
import { PackageListSection } from "./sections/package-list";
import { onBookingPaid } from "./services/bookings";
import { onPatientPackagePaid } from "./services/clinic";

registerSection("booking-widget", BookingWidgetSection);
registerSection("service-list", ServiceListSection);
registerSection("staff-grid", StaffGridSection);
registerSection("package-list", PackageListSection);

registerPaymentHandler("booking", onBookingPaid);
registerPaymentHandler("patient_package", onPatientPackagePaid);
