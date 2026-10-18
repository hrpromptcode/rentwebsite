/** Event form values + mapping from a DB row. Plain module (no "use client") so server pages can call eventToForm(). */

export interface EventFormValues {
  title: string;
  slug: string;
  summary: string;
  description: string;
  category: string;
  venueName: string;
  venueAddress: string;
  venueMapUrl: string;
  organizer: string;
  featured: boolean;
  sort: string;
  /** first image = cover */
  images: string[];
}

export const EMPTY_EVENT: EventFormValues = { title: "", slug: "", summary: "", description: "", category: "", venueName: "", venueAddress: "", venueMapUrl: "", organizer: "", featured: false, sort: "0", images: [] };

export function eventToForm(e: { title: string; slug: string; summary: string | null; description: string | null; cover: string | null; gallery: string[]; category: string | null; venueName: string | null; venueAddress: string | null; venueMapUrl: string | null; organizer: string | null; featured: boolean; sort: number }): EventFormValues {
  return {
    title: e.title,
    slug: e.slug,
    summary: e.summary ?? "",
    description: e.description ?? "",
    category: e.category ?? "",
    venueName: e.venueName ?? "",
    venueAddress: e.venueAddress ?? "",
    venueMapUrl: e.venueMapUrl ?? "",
    organizer: e.organizer ?? "",
    featured: e.featured,
    sort: String(e.sort),
    images: [...(e.cover ? [e.cover] : []), ...e.gallery.filter((g) => g !== e.cover)],
  };
}
