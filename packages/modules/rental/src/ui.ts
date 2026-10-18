/** Server-safe UI building blocks for storefront pages in apps/web. */
export { StaySearchSection, searchDates, type StaySearchExtra } from "./sections/stay-search";
export { RoomGridSection } from "./sections/room-grid";
export { RoomCard, RoomSpecs, AmenityChips, StayStatusBadge, PriceFrom, type RoomCardType } from "./components/room-card";
export { QuoteBreakdown, type QuoteBreakdownData } from "./components/quote-breakdown";
export { L, STAY_STATUS, STAY_PAYMENT_STATUS, METHOD_LABELS, EXTRA_PRICING_LABEL } from "./labels";
export { formatThaiYmd, formatThaiRange, formatThaiDateTime, nightsLabel } from "./services/time";
