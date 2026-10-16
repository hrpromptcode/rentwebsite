/** correctness bughunt – server-TZ dependent helpers (run with TZ=UTC). */
import { ageFrom } from "../../../apps/admin/src/app/t/[slug]/clinic/form-values";
const now = new Date("2026-10-16T18:30:00Z"); // = 2026-10-17 01:30 Asia/Bangkok
console.log("TZ", process.env.TZ, "| ageFrom('2000-10-17') at 2026-10-17 01:30 BKK =", ageFrom("2000-10-17", now), "(expected 26)");
console.log("patient-form max date at same instant:", now.toISOString().slice(0, 10), "(Bangkok date is 2026-10-17)");
