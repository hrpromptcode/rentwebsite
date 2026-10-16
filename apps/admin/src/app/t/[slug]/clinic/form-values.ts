/** Client-safe helpers shared by clinic server pages and client forms (no server imports). */
import type { PatientInput } from "@rentweb/module-booking/admin/schemas";
import { ageOn, bkkDateString } from "@rentweb/module-booking/time";

export interface PatientFormValues {
  firstName: string;
  lastName: string;
  nickname: string;
  gender: "" | "male" | "female" | "other";
  birthDate: string;
  phone: string;
  email: string;
  bloodType: string;
  allergies: string;
  chronicConditions: string;
  currentMedications: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  notes: string;
  tags: string;
}

export const EMPTY_PATIENT: PatientFormValues = {
  firstName: "",
  lastName: "",
  nickname: "",
  gender: "",
  birthDate: "",
  phone: "",
  email: "",
  bloodType: "",
  allergies: "",
  chronicConditions: "",
  currentMedications: "",
  emergencyName: "",
  emergencyPhone: "",
  emergencyRelation: "",
  notes: "",
  tags: "",
};

type PatientLike = {
  firstName: string;
  lastName: string | null;
  nickname: string | null;
  gender: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  bloodType: string | null;
  allergies: string | null;
  chronicConditions: string | null;
  currentMedications: string | null;
  emergencyContact: { name: string; phone: string; relation?: string } | null;
  notes: string | null;
  tags: string[];
};

export function patientToForm(p: PatientLike): PatientFormValues {
  return {
    firstName: p.firstName,
    lastName: p.lastName ?? "",
    nickname: p.nickname ?? "",
    gender: p.gender === "male" || p.gender === "female" || p.gender === "other" ? p.gender : "",
    birthDate: p.birthDate ?? "",
    phone: p.phone ?? "",
    email: p.email ?? "",
    bloodType: p.bloodType ?? "",
    allergies: p.allergies ?? "",
    chronicConditions: p.chronicConditions ?? "",
    currentMedications: p.currentMedications ?? "",
    emergencyName: p.emergencyContact?.name ?? "",
    emergencyPhone: p.emergencyContact?.phone ?? "",
    emergencyRelation: p.emergencyContact?.relation ?? "",
    notes: p.notes ?? "",
    tags: (p.tags ?? []).join(", "),
  };
}

export function patientFormToInput(v: PatientFormValues): PatientInput {
  return {
    firstName: v.firstName,
    lastName: v.lastName || null,
    nickname: v.nickname || null,
    gender: v.gender || null,
    birthDate: v.birthDate || null,
    phone: v.phone || null,
    email: v.email || null,
    bloodType: v.bloodType || null,
    allergies: v.allergies || null,
    chronicConditions: v.chronicConditions || null,
    currentMedications: v.currentMedications || null,
    emergencyName: v.emergencyName || null,
    emergencyPhone: v.emergencyPhone || null,
    emergencyRelation: v.emergencyRelation || null,
    notes: v.notes || null,
    tags: v.tags
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20),
  };
}

export function patientName(p: { firstName: string; lastName?: string | null; nickname?: string | null }): string {
  const full = [p.firstName, p.lastName].filter(Boolean).join(" ");
  return p.nickname ? `${full} (${p.nickname})` : full;
}

/** Age in full years from YYYY-MM-DD on the Bangkok calendar (COR-12; null when unknown). */
export function ageFrom(birthDate: string | null | undefined, now = new Date()): number | null {
  return ageOn(birthDate, now);
}

/** Today's date (YYYY-MM-DD) in Bangkok – e.g. the max of a birth-date picker (COR-12: not the UTC date). */
export function bkkToday(now = new Date()): string {
  return bkkDateString(now);
}

export interface PackageFormValues {
  name: string;
  description: string;
  image: string | null;
  serviceId: string;
  sessions: string;
  price: string;
  compareAtPrice: string;
  validityDays: string;
  active: boolean;
  sort: string;
}

export const EMPTY_PACKAGE: PackageFormValues = { name: "", description: "", image: null, serviceId: "", sessions: "5", price: "", compareAtPrice: "", validityDays: "365", active: true, sort: "0" };

/** Visit form state (money in baht strings while editing). */
export interface VisitFormValues {
  doctorId: string;
  chiefComplaint: string;
  vitals: { bp: string; hr: string; weight: string; temp: string; height: string };
  notes: string;
  diagnosis: string;
  procedures: Array<{ key: string; serviceId: string | null; name: string; price: string; staffId: string | null }>;
  prescriptions: Array<{ key: string; name: string; dose: string; qty: string; price: string }>;
  photosBefore: string[];
  photosAfter: string[];
  discount: string;
  nextVisitNote: string;
}

const AVATAR_COLORS = ["#0ea5e9", "#6366f1", "#ec4899", "#10b981", "#f59e0b", "#8b5cf6", "#14b8a6", "#f97316"];
/** Stable per-patient avatar colour. */
export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

let seq = 0;
export const rowKey = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;
