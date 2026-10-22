/** Server-safe UI building blocks for storefront pages in apps/web. */
export { BookingWidgetSection, loadWizardData, depositMethodOptions, wizardDates, type BookingWidgetExtra } from "./sections/booking-widget";
export { ServiceMenu } from "./sections/service-list";
export { ServiceCard, StaffCard, PackageCard, BookingStatusBadge, PackageStatusBadge, servicePriceLabel } from "./components/cards";
export { InstructorAvatar, LevelBadge, SeatsPill, SeatMeter, SessionRow, enrolHref, weeklyRhythm, LEVEL_DOT_VAR } from "./components/class-cards";
export { WeekTimetable, type WeekTimetableProps } from "./components/week-timetable";
export { L, BOOKING_STATUS, PAYMENT_STATUS, PACKAGE_STATUS, METHOD_LABELS } from "./labels";
/* hi-end redesign building blocks (motif per business, theme colours) */
export { lookOf, frameClass, pad2, INDEX_LABEL, type Look } from "./components/hi/look";
export { BookingStyles } from "./components/hi/styles";
export { ModuleIntro, CompactIntro, titleStep, nameLines } from "./components/hi/intro";
export { FilterPills, type PillItem } from "./components/hi/filter-pills";
export { Portrait, portraitSrc } from "./components/hi/portrait";
export { ServiceMotifCard, ServiceIndex, ServicesAside, type ServiceViewData } from "./components/hi/service-views";
export { StaffPortraitCard, InstructorPillCard, type PersonData } from "./components/hi/people-views";
export { PassTicket, DropInTicket, savePct } from "./components/hi/pass-views";
export { ClassStudioCard } from "./components/hi/class-views";
export { StatusTicket, SuccessCheck, DetailRows } from "./components/hi/status-views";
