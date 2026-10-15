import { th } from "./th";
import { en } from "./en";

export type Locale = "th" | "en";
export type MessageKey = keyof typeof th;
export type Messages = Record<MessageKey, string>;

const DICT: Record<Locale, Messages> = { th: th as Messages, en: { ...(th as Messages), ...(en as Partial<Messages>) } as Messages };

export function getMessages(locale: string): Messages {
  return DICT[(locale as Locale) in DICT ? (locale as Locale) : "th"];
}

/** t("cart.add") with optional {name} interpolation */
export function translator(locale: string) {
  const m = getMessages(locale);
  return (key: MessageKey, vars?: Record<string, string | number>): string => {
    let s: string = m[key] ?? (th as Messages)[key] ?? String(key);
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

export type T = ReturnType<typeof translator>;
export { th, en };
