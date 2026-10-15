import { getAdminDb } from "@rentweb/db";
import { processOutbox } from "@rentweb/integrations/outbox";

/**
 * Drains the events outbox. Call it from a cron (Vercel Cron / external scheduler) or the dev worker:
 *   curl -X POST -H "x-internal-secret: $INTERNAL_SECRET" http://localhost:3000/api/internal/outbox
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.INTERNAL_SECRET;
  const given = req.headers.get("x-internal-secret") ?? new URL(req.url).searchParams.get("secret");
  if (process.env.NODE_ENV === "production" && (!secret || given !== secret)) return new Response("forbidden", { status: 403 });
  if (secret && given !== secret && process.env.NODE_ENV !== "production" && given) return new Response("forbidden", { status: 403 });
  const limit = Math.min(100, Number(new URL(req.url).searchParams.get("limit") ?? 25));
  const result = await processOutbox(getAdminDb(), limit);
  return Response.json(result);
}

export const GET = POST;
