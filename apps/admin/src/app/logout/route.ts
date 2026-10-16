import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sanitizeNext } from "@/lib/safe-next";

/** Signs out and returns to /login (optionally keeping a safe relative `next` path). */
export async function GET(req: Request) {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    /* already signed out */
  }
  const next = new URL(req.url).searchParams.get("next");
  const safeNext = sanitizeNext(next);
  return NextResponse.redirect(new URL(safeNext ? `/login?next=${encodeURIComponent(safeNext)}` : "/login", req.url));
}

export const POST = GET;
