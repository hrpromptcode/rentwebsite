/**
 * Minimal allow-list HTML sanitizer for product descriptions (server side, no DOM needed).
 * Keeps basic formatting tags and safe links; strips everything else including event handlers.
 */
const ALLOWED = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "a", "span",
  "table", "thead", "tbody", "tr", "th", "td", "hr",
]);

function safeHref(href: string): string | null {
  const v = href.trim();
  if (/^(https?:|mailto:|tel:)/i.test(v) || v.startsWith("/") || v.startsWith("#")) return v.replace(/"/g, "&quot;");
  return null;
}

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  let html = input;
  // drop dangerous blocks together with their content
  html = html.replace(/<(script|style|iframe|object|embed|form|textarea|noscript|svg|math)\b[\s\S]*?<\/\1\s*>/gi, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  // rewrite every remaining tag, keeping only allowed names and a safe href on <a>
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g, (m, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED.has(name)) return "";
    if (m.startsWith("</")) return `</${name}>`;
    if (name === "a") {
      const hrefMatch = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const href = hrefMatch ? safeHref(hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? "") : null;
      return href ? `<a href="${href}" rel="noopener noreferrer nofollow" target="_blank">` : "<a>";
    }
    if (name === "br" || name === "hr") return `<${name}/>`;
    return `<${name}>`;
  });
  return html;
}

/** Plain text (meta descriptions, JSON-LD). */
export function stripHtml(input: string | null | undefined, max = 300): string {
  if (!input) return "";
  const text = input.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
