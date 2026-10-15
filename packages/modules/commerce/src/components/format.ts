const dt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const d = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });

export function dateTimeTh(value: Date | string | null | undefined): string {
  if (!value) return "";
  return dt.format(typeof value === "string" ? new Date(value) : value);
}

export function dateTh(value: Date | string | null | undefined): string {
  if (!value) return "";
  return d.format(typeof value === "string" ? new Date(value) : value);
}
