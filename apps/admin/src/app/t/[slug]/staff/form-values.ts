/** Plain .ts (no "use client") so server pages can build the initial values. */
export interface StaffFormValues {
  name: string;
  slug: string;
  title: string;
  bio: string;
  avatar: string | null;
  email: string;
  phone: string;
  color: string;
  kind: "person" | "room" | "equipment";
  acceptsOnlineBooking: boolean;
  active: boolean;
  sort: string;
  serviceIds: string[];
}

export const EMPTY_STAFF: StaffFormValues = {
  name: "",
  slug: "",
  title: "",
  bio: "",
  avatar: null,
  email: "",
  phone: "",
  color: "#6366f1",
  kind: "person",
  acceptsOnlineBooking: true,
  active: true,
  sort: "0",
  serviceIds: [],
};

export function staffToForm(s: {
  name: string;
  slug: string;
  title: string | null;
  bio: string | null;
  avatar: string | null;
  email: string | null;
  phone: string | null;
  color: string;
  kind: string;
  acceptsOnlineBooking: boolean;
  active: boolean;
  sort: number;
  serviceIds: string[];
}): StaffFormValues {
  return {
    name: s.name,
    slug: s.slug,
    title: s.title ?? "",
    bio: s.bio ?? "",
    avatar: s.avatar,
    email: s.email ?? "",
    phone: s.phone ?? "",
    color: /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : "#6366f1",
    kind: s.kind === "room" || s.kind === "equipment" ? s.kind : "person",
    acceptsOnlineBooking: s.acceptsOnlineBooking,
    active: s.active,
    sort: String(s.sort),
    serviceIds: s.serviceIds,
  };
}

export interface ServiceChoice {
  id: string;
  name: string;
  categoryName: string | null;
  durationMin: number;
  active: boolean;
}

/** Display order of weekdays in editors: Monday first (Thai business convention). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
