import { satangToBaht } from "@rentweb/module-booking/admin/schemas";

/** Plain .ts (no "use client") so server pages can build the initial values. */
export interface ServiceFormValues {
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  image: string | null;
  durationMin: string;
  bufferBeforeMin: string;
  bufferAfterMin: string;
  price: string;
  priceNote: string;
  depositRequired: boolean;
  depositAmount: string;
  capacity: string;
  requiresStaff: boolean;
  active: boolean;
  featured: boolean;
  sort: string;
}

export const EMPTY_SERVICE: ServiceFormValues = {
  categoryId: "",
  name: "",
  slug: "",
  description: "",
  image: null,
  durationMin: "60",
  bufferBeforeMin: "0",
  bufferAfterMin: "0",
  price: "",
  priceNote: "",
  depositRequired: false,
  depositAmount: "",
  capacity: "1",
  requiresStaff: true,
  active: true,
  featured: false,
  sort: "0",
};

export function serviceToForm(s: {
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  price: number;
  priceNote: string | null;
  depositRequired: boolean;
  depositAmount: number;
  capacity: number;
  requiresStaff: boolean;
  active: boolean;
  featured: boolean;
  sort: number;
}): ServiceFormValues {
  return {
    categoryId: s.categoryId ?? "",
    name: s.name,
    slug: s.slug,
    description: s.description ?? "",
    image: s.image,
    durationMin: String(s.durationMin),
    bufferBeforeMin: String(s.bufferBeforeMin),
    bufferAfterMin: String(s.bufferAfterMin),
    price: satangToBaht(s.price),
    priceNote: s.priceNote ?? "",
    depositRequired: s.depositRequired,
    depositAmount: satangToBaht(s.depositAmount),
    capacity: String(s.capacity),
    requiresStaff: s.requiresStaff,
    active: s.active,
    featured: s.featured,
    sort: String(s.sort),
  };
}

export function durationLabel(min: number): string {
  if (min < 60) return `${min} นาที`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}
