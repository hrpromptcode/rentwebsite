import type { NextRequest } from "next/server";
import { findUser, mockEnabled, notFound, open, pictureUrl } from "../../_mock";

export const dynamic = "force-dynamic";

/** GET /api/dev/line-mock/v2/profile — Bearer access token → { userId, displayName, pictureUrl }. */
export function GET(req: NextRequest) {
  if (!mockEnabled()) return notFound();
  const auth = req.headers.get("authorization") ?? "";
  const token = open<{ u: string; exp: number }>(auth.startsWith("Bearer ") ? auth.slice(7) : null);
  const user = token ? findUser(token.u) : undefined;
  if (!user) return Response.json({ message: "The access token expired" }, { status: 401 });
  const origin = `${req.nextUrl.protocol}//${req.headers.get("host") ?? req.nextUrl.host}`;
  return Response.json({ userId: user.userId, displayName: user.displayName, pictureUrl: pictureUrl(origin, user.userId), statusMessage: "mock" }, { headers: { "cache-control": "no-store" } });
}
