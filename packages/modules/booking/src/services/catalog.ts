import { and, asc, eq, inArray, type Tx } from "@rentweb/db";
import { serviceCategories, services, staff, staffServices } from "@rentweb/db";

export type ServiceRow = typeof services.$inferSelect;
export type StaffRow = typeof staff.$inferSelect;
export type ServiceCategoryRow = typeof serviceCategories.$inferSelect;

export interface ServiceWithCategory extends ServiceRow {
  categoryName: string | null;
  categorySlug: string | null;
}

export interface StaffWithServices extends StaffRow {
  serviceIds: string[];
}

export interface StaffForService extends StaffRow {
  priceOverride: number | null;
  durationOverrideMin: number | null;
}

export interface ListServicesOptions {
  featured?: boolean;
  categorySlug?: string;
  limit?: number;
  /** include inactive services (admin) */
  includeInactive?: boolean;
}

export async function listServiceCategories(tx: Tx, tenantId: string): Promise<ServiceCategoryRow[]> {
  return tx.select().from(serviceCategories).where(eq(serviceCategories.tenantId, tenantId)).orderBy(asc(serviceCategories.sort), asc(serviceCategories.name));
}

export async function listServices(tx: Tx, tenantId: string, opts: ListServicesOptions = {}): Promise<ServiceWithCategory[]> {
  const conds = [eq(services.tenantId, tenantId)];
  if (!opts.includeInactive) conds.push(eq(services.active, true));
  if (opts.featured) conds.push(eq(services.featured, true));
  if (opts.categorySlug) conds.push(eq(serviceCategories.slug, opts.categorySlug));
  const q = tx
    .select({ s: services, categoryName: serviceCategories.name, categorySlug: serviceCategories.slug })
    .from(services)
    .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
    .where(and(...conds))
    .orderBy(asc(serviceCategories.sort), asc(services.sort), asc(services.name));
  const rows = opts.limit ? await q.limit(opts.limit) : await q;
  return rows.map((r) => ({ ...r.s, categoryName: r.categoryName, categorySlug: r.categorySlug }));
}

export async function getServiceBySlug(tx: Tx, tenantId: string, slug: string): Promise<ServiceWithCategory | null> {
  const [r] = await tx
    .select({ s: services, categoryName: serviceCategories.name, categorySlug: serviceCategories.slug })
    .from(services)
    .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
    .where(and(eq(services.tenantId, tenantId), eq(services.slug, slug)))
    .limit(1);
  return r ? { ...r.s, categoryName: r.categoryName, categorySlug: r.categorySlug } : null;
}

export async function getServiceById(tx: Tx, tenantId: string, id: string): Promise<ServiceWithCategory | null> {
  const [r] = await tx
    .select({ s: services, categoryName: serviceCategories.name, categorySlug: serviceCategories.slug })
    .from(services)
    .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
    .where(and(eq(services.tenantId, tenantId), eq(services.id, id)))
    .limit(1);
  return r ? { ...r.s, categoryName: r.categoryName, categorySlug: r.categorySlug } : null;
}

export interface ListStaffOptions {
  /** only staff that accept online booking (storefront default) */
  onlineOnly?: boolean;
  limit?: number;
  includeInactive?: boolean;
}

/** Active staff with the ids of services they perform. */
export async function listStaff(tx: Tx, tenantId: string, opts: ListStaffOptions = {}): Promise<StaffWithServices[]> {
  const conds = [eq(staff.tenantId, tenantId)];
  if (!opts.includeInactive) conds.push(eq(staff.active, true));
  if (opts.onlineOnly) conds.push(eq(staff.acceptsOnlineBooking, true));
  const q = tx.select().from(staff).where(and(...conds)).orderBy(asc(staff.sort), asc(staff.name));
  const rows = opts.limit ? await q.limit(opts.limit) : await q;
  if (!rows.length) return [];
  const links = await tx
    .select({ staffId: staffServices.staffId, serviceId: staffServices.serviceId })
    .from(staffServices)
    .where(and(eq(staffServices.tenantId, tenantId), inArray(staffServices.staffId, rows.map((r) => r.id))));
  const byStaff = new Map<string, string[]>();
  for (const l of links) byStaff.set(l.staffId, [...(byStaff.get(l.staffId) ?? []), l.serviceId]);
  return rows.map((r) => ({ ...r, serviceIds: byStaff.get(r.id) ?? [] }));
}

export interface StaffDetail extends StaffRow {
  services: Array<ServiceWithCategory & { priceOverride: number | null; durationOverrideMin: number | null }>;
}

export async function getStaffBySlug(tx: Tx, tenantId: string, slug: string): Promise<StaffDetail | null> {
  const [row] = await tx.select().from(staff).where(and(eq(staff.tenantId, tenantId), eq(staff.slug, slug))).limit(1);
  if (!row) return null;
  const links = await tx
    .select({ s: services, categoryName: serviceCategories.name, categorySlug: serviceCategories.slug, priceOverride: staffServices.priceOverride, durationOverrideMin: staffServices.durationOverrideMin })
    .from(staffServices)
    .innerJoin(services, eq(staffServices.serviceId, services.id))
    .leftJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
    .where(and(eq(staffServices.tenantId, tenantId), eq(staffServices.staffId, row.id), eq(services.active, true)))
    .orderBy(asc(serviceCategories.sort), asc(services.sort));
  return {
    ...row,
    services: links.map((l) => ({ ...l.s, categoryName: l.categoryName, categorySlug: l.categorySlug, priceOverride: l.priceOverride, durationOverrideMin: l.durationOverrideMin })),
  };
}

export async function getStaffById(tx: Tx, tenantId: string, id: string): Promise<StaffRow | null> {
  const [row] = await tx.select().from(staff).where(and(eq(staff.tenantId, tenantId), eq(staff.id, id))).limit(1);
  return row ?? null;
}

/** Staff who perform a service and accept online booking, in display order. */
export async function listStaffForService(tx: Tx, tenantId: string, serviceId: string): Promise<StaffForService[]> {
  const rows = await tx
    .select({ st: staff, priceOverride: staffServices.priceOverride, durationOverrideMin: staffServices.durationOverrideMin })
    .from(staffServices)
    .innerJoin(staff, eq(staffServices.staffId, staff.id))
    .where(and(eq(staffServices.tenantId, tenantId), eq(staffServices.serviceId, serviceId), eq(staff.active, true), eq(staff.acceptsOnlineBooking, true)))
    .orderBy(asc(staff.sort), asc(staff.name));
  return rows.map((r) => ({ ...r.st, priceOverride: r.priceOverride, durationOverrideMin: r.durationOverrideMin }));
}
