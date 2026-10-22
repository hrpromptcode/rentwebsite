/** Server-safe presentational pieces (no hooks): event card, date leaf, badges, e-ticket card, order lines. Client widgets live in ../client.ts. */
export { EventCard, DateBadge, DateStamp, dotDate, hhmm, weekdayTime, PriceFrom, SaleStateBadge, EventStatusBadge, OrderStatusBadge, TicketStatusBadge, SALE_STATE, eventWhen, type EventCardEvent, type EventCardStats } from "./event-card";
export { TicketCard, type TicketCardData, type TicketCardProps } from "./ticket-card";
export { OrderLines, type OrderLinesData } from "./order-summary";
export { EvStyles } from "./ev-styles";
