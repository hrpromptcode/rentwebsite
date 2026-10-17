/**
 * Side-effect module: registers storefront section components and payment hooks.
 * Imported once by apps/web/src/modules.ts (also loaded by the worker, so the expiry sweep sees the closed handlers).
 */
import { registerSection } from "@rentweb/storefront";
import { registerPaymentClosedHandler, registerPaymentHandler } from "@rentweb/core/payments";
import { BookingWidgetSection } from "./sections/booking-widget";
import { ServiceListSection } from "./sections/service-list";
import { StaffGridSection } from "./sections/staff-grid";
import { PackageListSection } from "./sections/package-list";
import { ClassHighlightsSection } from "./sections/class-highlights";
import { WeeklyScheduleSection } from "./sections/weekly-schedule";
import { InstructorGridSection } from "./sections/instructor-grid";
import { PassPricingSection } from "./sections/pass-pricing";
import { onBookingPaid, onBookingPaymentClosed } from "./services/bookings";
import { onPatientPackagePaid, onPatientPackagePaymentClosed } from "./services/clinic";

registerSection("booking-widget", BookingWidgetSection);
registerSection("service-list", ServiceListSection);
registerSection("staff-grid", StaffGridSection);
registerSection("package-list", PackageListSection);
// course / studio template
registerSection("class-highlights", ClassHighlightsSection);
registerSection("weekly-schedule", WeeklyScheduleSection);
registerSection("instructor-grid", InstructorGridSection);
registerSection("pass-pricing", PassPricingSection);

registerPaymentHandler("booking", onBookingPaid);
registerPaymentHandler("patient_package", onPatientPackagePaid);
// payments-api 3.2: voided / expired deposits release the slot, unpaid course purchases are cancelled
registerPaymentClosedHandler("booking", onBookingPaymentClosed);
registerPaymentClosedHandler("patient_package", onPatientPackagePaymentClosed);
