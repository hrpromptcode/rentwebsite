import * as React from "react";
import { segmentText, THAI_RE } from "./split";

/**
 * Thai line breaking for plain (non-animated) display text. SERVER ONLY — segmentation must not run again on the client
 * (Node and browser ICU builds differ → hydration mismatch). Chromium breaks Thai with its ICU dictionary, which splits
 * many loanwords ("โฟล์|กก|ลาง"); the kit's segmenter repairs them (THAI_GLUE_WORDS, ์ / combining-mark fragments, U+2060),
 * then every Thai word becomes a nowrap span with a <wbr> before the next Thai word — lines only break between real
 * words. Text content (accessible names, getByText) is unchanged; "\n" and spaces are kept for white-space:pre-line.
 * Latin-only strings pass through untouched.
 */
export function ThaiWrap({ text }: { text: string }) {
  if (!text || !THAI_RE.test(text)) return <>{text}</>;
  const toks = segmentText(text, "words");
  return (
    <>
      {toks.map((t, i) => {
        const th = THAI_RE.test(t);
        const next = toks[i + 1];
        return (
          <React.Fragment key={i}>
            {th ? <span className="whitespace-nowrap">{t}</span> : t}
            {th && next && THAI_RE.test(next.charAt(0)) ? <wbr /> : null}
          </React.Fragment>
        );
      })}
    </>
  );
}
