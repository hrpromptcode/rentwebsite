import { findUser, mockEnabled, notFound } from "../../_mock";

export const dynamic = "force-dynamic";

/** GET /api/dev/line-mock/picture/:userId — an SVG avatar with the user's initial (stands in for LINE's picture URL). */
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  if (!mockEnabled()) return notFound();
  const { userId } = await params;
  const user = findUser(decodeURIComponent(userId));
  if (!user) return notFound();
  const initial = Array.from(user.displayName.trim())[0] ?? "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200" role="img" aria-label="${user.displayName.replace(/"/g, "")}"><rect width="200" height="200" rx="100" fill="#06C755"/><text x="100" y="118" text-anchor="middle" font-family="system-ui, 'Noto Sans Thai', sans-serif" font-size="88" font-weight="600" fill="#fff">${initial.replace(/[<&]/g, "")}</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600" } });
}
