/**
 * Allow-list HTML sanitizer for product descriptions (server side, no DOM needed).
 *
 * A small tokenizer walks the input once and the output is rebuilt from scratch: text is HTML-escaped, allowed tags
 * are re-emitted from their lower-cased name plus vetted attributes, everything else (unknown tags, event handlers,
 * comments, doctype, script/style/iframe/svg blocks, unterminated tags) is dropped or escaped. Nothing from the input
 * is copied through as raw markup, so a difference between this tokenizer and the browser's parser cannot produce
 * executable markup. (Stored XSS, reverify 2026-10-17: the previous regex rewrite only touched tags ending in ">", so
 * an unterminated trailing `<img src=x onerror=... x=` passed through and the page's own `</div>` closed it.)
 */

const ALLOWED = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "a", "span",
  "table", "thead", "tbody", "tr", "th", "td", "hr",
]);
const VOID = new Set(["br", "hr"]);
/** Dropped together with everything up to their end tag (raw text, embedding and foreign-content elements). */
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "form", "textarea", "select",
  "noscript", "noembed", "noframes", "template", "title", "xmp", "plaintext", "svg", "math",
]);
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

type Token =
  | { kind: "text"; value: string }
  | { kind: "start"; name: string; attrs: Array<[string, string]> }
  | { kind: "end"; name: string };

const isWs = (c: string | undefined) => c === " " || c === "\t" || c === "\n" || c === "\f" || c === "\r";
const isAlpha = (c: string | undefined) => !!c && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));

/** Reads `name attr=value ...>` starting at the tag name; null when the input ends before the closing ">". */
function readTag(src: string, start: number): { name: string; attrs: Array<[string, string]>; end: number } | null {
  const n = src.length;
  let i = start;
  while (i < n && !isWs(src[i]) && src[i] !== "/" && src[i] !== ">") i++;
  const name = src.slice(start, i).toLowerCase();
  const attrs: Array<[string, string]> = [];
  while (i < n) {
    const c = src[i];
    if (isWs(c) || c === "/") {
      i++;
      continue;
    }
    if (c === ">") return { name, attrs, end: i + 1 };
    const nameStart = i;
    i++; // the first character always belongs to the name (also a leading "=", as in the HTML spec)
    while (i < n && !isWs(src[i]) && src[i] !== "/" && src[i] !== ">" && src[i] !== "=") i++;
    const attrName = src.slice(nameStart, i).toLowerCase();
    while (i < n && isWs(src[i])) i++;
    if (src[i] !== "=") {
      attrs.push([attrName, ""]);
      continue;
    }
    i++;
    while (i < n && isWs(src[i])) i++;
    if (i >= n) return null;
    const q = src[i];
    if (q === '"' || q === "'") {
      const close = src.indexOf(q, i + 1);
      if (close === -1) return null;
      attrs.push([attrName, src.slice(i + 1, close)]);
      i = close + 1;
    } else {
      const valueStart = i;
      while (i < n && !isWs(src[i]) && src[i] !== ">") i++;
      attrs.push([attrName, src.slice(valueStart, i)]);
    }
  }
  return null;
}

/** Index just past `</name ...>` (case-insensitive), or the end of the input when the element is never closed. */
function skipElement(src: string, from: number, name: string): number {
  let j = src.indexOf("</", from);
  while (j !== -1) {
    const after = src[j + 2 + name.length];
    if (src.slice(j + 2, j + 2 + name.length).toLowerCase() === name && (after === undefined || isWs(after) || after === "/" || after === ">")) {
      const gt = src.indexOf(">", j);
      return gt === -1 ? src.length : gt + 1;
    }
    j = src.indexOf("</", j + 2);
  }
  return src.length;
}

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const n = src.length;
  let text = "";
  let i = 0;
  const flush = () => {
    if (text) out.push({ kind: "text", value: text });
    text = "";
  };
  while (i < n) {
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      text += src.slice(i);
      break;
    }
    text += src.slice(i, lt);
    i = lt;
    const next = src[i + 1];
    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      flush();
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (next === "!" || next === "?" || (next === "/" && !isAlpha(src[i + 2]) && src[i + 2] !== undefined)) {
      // doctype, CDATA, processing instruction, bogus end tag: dropped up to the next ">"
      const end = src.indexOf(">", i + 1);
      if (end === -1) {
        text += "<";
        i++;
        continue;
      }
      flush();
      i = end + 1;
      continue;
    }
    const isEnd = next === "/";
    const nameStart = i + (isEnd ? 2 : 1);
    const tag = isAlpha(src[nameStart]) ? readTag(src, nameStart) : null;
    if (!tag) {
      // a "<" that does not open a complete tag (e.g. an unterminated trailing tag) is plain text
      text += "<";
      i++;
      continue;
    }
    flush();
    i = tag.end;
    if (isEnd) out.push({ kind: "end", name: tag.name });
    else if (DROP_WITH_CONTENT.has(tag.name)) i = skipElement(src, i, tag.name);
    else out.push({ kind: "start", name: tag.name, attrs: tag.attrs });
  }
  flush();
  return out;
}

const NAMED: Record<string, string> = {
  amp: "&", AMP: "&", lt: "<", LT: "<", gt: ">", GT: ">", quot: '"', QUOT: '"', apos: "'", nbsp: " ",
  colon: ":", Tab: "\t", NewLine: "\n", lpar: "(", rpar: ")", sol: "/", bsol: "\\", period: ".", comma: ",",
  semi: ";", equals: "=", num: "#", excl: "!", quest: "?", percnt: "%", plus: "+", hyphen: "-", dash: "-",
  lowbar: "_", commat: "@", lsqb: "[", rsqb: "]", lcub: "{", rcub: "}", grave: "`", Hat: "^", verbar: "|",
};

/**
 * Decodes numeric references (";" optional, as browsers do) and the ASCII-relevant named ones (";" required);
 * unknown names stay literal. Only used on values that are re-escaped afterwards, so the result is exactly what
 * the browser will see.
 */
function decodeEntities(s: string): string {
  return s.replace(/&(?:#([xX][0-9a-fA-F]+|[0-9]+);?|([A-Za-z][A-Za-z0-9]*);)/g, (m, num: string | undefined, name: string | undefined) => {
    if (num) {
      const hex = num[0] === "x" || num[0] === "X";
      const cp = parseInt(hex ? num.slice(1) : num, hex ? 16 : 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return "�";
      return String.fromCodePoint(cp);
    }
    return (name && NAMED[name]) ?? m;
  });
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const ENTITY_REF = /^&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/;

/** Text content: escapes < > " ' and every & that does not start a well-formed character reference. */
function escapeText(s: string): string {
  return s.replace(/[&<>"']/g, (c: string, off: number) => (c === "&" && ENTITY_REF.test(s.slice(off, off + 40)) ? "&" : ESC[c]!));
}

/** Attribute value built from an already decoded string: every special character is escaped. */
function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

const CONTROL = /[\u0000-\u001f\u007f]/;
const TRIM_C0 = /^[\u0000- ]+|[\u0000- ]+$/g;

/** Decoded href when it is http(s)/mailto/tel or relative; null for any other scheme (javascript:, data:, ...). */
function safeHref(raw: string | undefined): string | null {
  if (raw == null) return null;
  // what the browser's URL parser sees: references decoded, tab/CR/LF removed anywhere, C0 controls and spaces trimmed
  const v = decodeEntities(raw).replace(/[\t\n\r]/g, "").replace(TRIM_C0, "");
  if (!v || CONTROL.test(v)) return null;
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(v);
  if (scheme) return SAFE_SCHEMES.has(scheme[1]!.toLowerCase()) ? v : null;
  return v;
}

function startTag(name: string, attrs: Array<[string, string]>): string {
  const get = (key: string) => attrs.find(([k]) => k === key)?.[1]; // first occurrence wins, as in browsers
  if (name === "a") {
    const href = safeHref(get("href"));
    if (!href) return "<a>";
    const parts = [`href="${escapeAttr(href)}"`];
    const title = get("title");
    if (title) parts.push(`title="${escapeText(title)}"`);
    const external = /^(https?:)?\/\//i.test(href);
    if (external || decodeEntities(get("target") ?? "").trim().toLowerCase() === "_blank") {
      parts.push('target="_blank"', 'rel="noopener noreferrer nofollow"');
    }
    return `<a ${parts.join(" ")}>`;
  }
  if (name === "td" || name === "th") {
    const spans = (["colspan", "rowspan"] as const)
      .map((k) => [k, decodeEntities(get(k) ?? "").trim()] as const)
      .filter(([, v]) => /^[1-9][0-9]?$/.test(v))
      .map(([k, v]) => ` ${k}="${v}"`);
    return `<${name}${spans.join("")}>`;
  }
  return `<${name}>`;
}

/** Start tags that implicitly close an open element, with the elements that shield it (HTML "scope"). */
const BLOCKS = new Set(["p", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "table", "hr"]);
const P_SCOPE = ["table", "td", "th"];
function implicitCloses(name: string): Array<[string, string[]]> {
  const r: Array<[string, string[]]> = [];
  if (name === "li") r.push(["li", ["ul", "ol", ...P_SCOPE]]);
  if (BLOCKS.has(name)) r.push(["p", P_SCOPE]);
  if (name === "td" || name === "th") r.push(["td", ["tr", "table"]], ["th", ["tr", "table"]]);
  if (name === "tr") r.push(["tr", ["table"]]);
  if (name === "thead" || name === "tbody") r.push(["thead", ["table"]], ["tbody", ["table"]]);
  return r;
}

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  const out: string[] = [];
  const open: string[] = [];
  const closeTo = (at: number) => {
    while (open.length > at) out.push(`</${open.pop()}>`);
  };
  for (const t of tokenize(String(input))) {
    if (t.kind === "text") {
      out.push(escapeText(t.value));
      continue;
    }
    if (!ALLOWED.has(t.name)) continue;
    if (t.kind === "start") {
      // `<p>a<p>b`, `<li>a<li>b`: close the previous one here, as the browser would, instead of nesting it
      for (const [target, shields] of implicitCloses(t.name)) {
        for (let k = open.length - 1; k >= 0 && !shields.includes(open[k]!); k--) {
          if (open[k] === target) {
            closeTo(k);
            break;
          }
        }
      }
      if (VOID.has(t.name)) out.push(`<${t.name}/>`);
      else {
        out.push(startTag(t.name, t.attrs));
        open.push(t.name);
      }
      continue;
    }
    // end tag: closes only an element this output opened (innermost first); strays are dropped
    const at = open.lastIndexOf(t.name);
    if (at !== -1) closeTo(at);
  }
  // nothing may stay open: an unclosed <a> would otherwise wrap the rest of the page
  closeTo(0);
  return out.join("");
}

/** Plain text (meta descriptions, JSON-LD). */
export function stripHtml(input: string | null | undefined, max = 300): string {
  if (!input) return "";
  const text = tokenize(String(input))
    .map((t) => (t.kind === "text" ? decodeEntities(t.value) : " "))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
