import * as React from "react";
import { ThaiWrap } from "@rentweb/ui/motion";

/**
 * Compounds that Node's ICU dictionary splits inside product / category names: "ฝ้ายออร์แกนิก" → "ฝ้า|ยออร์|แก|นิก"
 * (so a card title broke as "ฝ้า⏎ยออร์แกนิก"), "สั่ง|ทำ", "หมวด|หมู่", "ของ|แต่ง|บ้าน", "เครื่อง|ดื่ม". Module-local until the kit's
 * THAI_GLUE_WORDS carries them (qa_shared.md, qa-a #1 / #7).
 */
const GLUE = ["ออร์แกนิก", "สั่งทำ", "หมวดหมู่", "ของแต่งบ้าน", "ทอมือ", "เครื่องดื่ม", "เครื่องประดับ", "เครื่องสำอาง", "ห้องพัก"] as const;
const GLUE_RE = new RegExp(`(${GLUE.join("|")})`, "g");
const THAI_END = /[฀-๿]$/;
const THAI_START = /^[฀-๿]/;
/**
 * Rough advance (em) of a phrase: Thai bases 0.62, following vowels ะ า ำ 0.5, marks 0, anything else 0.55 — measured
 * on Anuphan / Mitr / Fahkwang it errs a little wide, which is the safe side here.
 */
export const phraseEm = (s: string) =>
  [...s].reduce((em, ch) => em + (/[ัิ-ฺ็-๎]/.test(ch) ? 0 : /[ะาำๅ]/.test(ch) ? 0.5 : /[ก-ฯเ-ๆ]/.test(ch) ? 0.62 : /\s/.test(ch) ? 0.28 : 0.55), 0);
/** widest phrase (em) that fits one line of the narrowest card title: 2-up grid on a 360 px phone ≈ 120 px at 16 px */
const CARD_PHRASE_EM = 7.4;

function Words({ text }: { text: string }) {
  const parts = text.split(GLUE_RE).filter(Boolean);
  if (parts.length < 2) return <ThaiWrap text={text} />;
  return (
    <>
      {parts.map((part, i) => {
        const prev = parts[i - 1];
        const glue = (GLUE as readonly string[]).includes(part);
        return (
          <React.Fragment key={i}>
            {prev && THAI_END.test(prev) && THAI_START.test(part) ? <wbr /> : null}
            {glue ? <span className="whitespace-nowrap">{part}</span> : <ThaiWrap text={part} />}
          </React.Fragment>
        );
      })}
    </>
  );
}


/**
 * ThaiWrap for names. SERVER ONLY (same reason as ThaiWrap); the text content is unchanged (no joiners), so
 * accessible names and getByText stay exact.
 *  - the glue compounds above stay one unbreakable unit;
 *  - `phrases`: Thai names put their phrase breaks at spaces ("กางเกงขากว้าง ผ้าฝ้ายซักนุ่ม"), but the line breaker
 *    treats every dictionary word as equal and text-wrap: balance then picks a break inside a phrase ("…ผ้า⏎ฝ้าย…",
 *    "เค้กวันเกิด⏎สั่งทำ (เริ่มต้น)"). Phrases that surely fit one title line (≤ maxEm) become inline-blocks, so lines
 *    break between them; longer phrases stay breakable, so they never push a short tail to a third line
 *    ("ปลอกหมอนผ้าฝ้าย⏎ทอ (คู่)", not "ปลอกหมอนผ้า⏎ฝ้ายทอ⏎(คู่)" — compact cards clamp at 2 lines).
 */
export function ThaiName({ text, phrases = false, maxEm = CARD_PHRASE_EM }: { text: string; phrases?: boolean; maxEm?: number }) {
  if (!phrases || !/\s/.test(text.trim())) return <Words text={text} />;
  // a quantity stays with its unit: "1 ปอนด์", "(3 ชิ้น)" are one phrase (no "…1⏎ปอนด์")
  const parts: string[] = [];
  for (const tok of text.split(/(\s+)/)) {
    const prev = parts.length >= 2 ? parts[parts.length - 2]! : "";
    if (tok && !/^\s+$/.test(tok) && /^[([]?\d+(?:[.,]\d+)?$/.test(prev)) {
      const space = parts.pop()!;
      parts[parts.length - 1] = prev + space + tok;
    } else parts.push(tok);
  }
  return (
    <>
      {parts.map((part, i) =>
        !part ? null : /^\s+$/.test(part) ? (
          <React.Fragment key={i}>{part}</React.Fragment>
        ) : phraseEm(part) <= maxEm ? (
          <span key={i} className="inline-block">
            <Words text={part} />
          </span>
        ) : (
          <Words key={i} text={part} />
        ),
      )}
    </>
  );
}
