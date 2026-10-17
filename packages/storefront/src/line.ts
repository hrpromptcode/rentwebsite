/**
 * LINE chat links (ADMIN_B2-10). Owners type their LINE in many shapes; only some of them open a chat:
 *  - official account "@shop"                      → https://line.me/R/ti/p/%40shop
 *  - personal LINE ID "somchai.k" (no "@")          → https://line.me/ti/p/~somchai.k   (/R/ti/p/<id> is a dead link)
 *  - a full LINE URL (line.me / *.line.me / lin.ee, or line://…) → used as is (http upgraded to https)
 * `lineUrl` (an explicit URL setting) wins over `lineId` when it is a usable http(s)/line: URL.
 * Anything else (spaces inside, Thai text, other schemes) gets no link (`href: null`), never a dead or unsafe one.
 * Pure; shared by the floating chat button, the footer social icons and the contact section.
 */
export interface LineChat {
  /** chat link, or null when the value cannot be turned into one */
  href: string | null;
  /** what to show to customers ("@shop", "somchai.k" or "LINE" for a bare URL) */
  display: string;
}

const LINE_HOST = /(^|\.)line\.me$|^lin\.ee$/i;
const ID_CHARS = /^[A-Za-z0-9._-]{1,50}$/;

function fromUrl(raw: string, anyHost: boolean): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol === "line:") return raw;
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!u.hostname || (!anyHost && !LINE_HOST.test(u.hostname))) return null;
  if (LINE_HOST.test(u.hostname)) u.protocol = "https:";
  return u.toString();
}

/** "@shop" / "~somchai" in a LINE URL path, for display. */
function idFromUrl(href: string): string | null {
  const m = /\/ti\/p\/(?:%40|@)([^/?#]+)/i.exec(href) ?? null;
  if (m) return `@${decodeURIComponent(m[1]!)}`;
  const p = /\/ti\/p\/~([^/?#]+)/i.exec(href);
  return p ? decodeURIComponent(p[1]!) : null;
}

export function lineChat(input: { lineId?: string | null; lineUrl?: string | null }): LineChat | null {
  const url = input.lineUrl?.trim();
  const id = input.lineId?.trim().replace(/\s+/g, "") ?? "";
  if (url) {
    const href = fromUrl(url, true);
    if (href) return { href, display: id && !/^[a-z][a-z0-9+.-]*:/i.test(id) ? id : (idFromUrl(href) ?? "LINE") };
  }
  if (!id) return null;
  if (/^(https?|line):/i.test(id)) {
    const href = fromUrl(id, false);
    return href ? { href, display: idFromUrl(href) ?? "LINE" } : null;
  }
  if (id.startsWith("@")) {
    const name = id.slice(1);
    return { href: ID_CHARS.test(name) ? `https://line.me/R/ti/p/${encodeURIComponent(`@${name}`)}` : null, display: id };
  }
  const personal = id.replace(/^~/, "");
  return { href: ID_CHARS.test(personal) ? `https://line.me/ti/p/~${encodeURIComponent(personal)}` : null, display: personal };
}
