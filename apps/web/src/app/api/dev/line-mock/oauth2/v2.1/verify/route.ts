import type { NextRequest } from "next/server";
import { LINE_ID_TOKEN_ISSUER, decodeJwtUnverified } from "@rentweb/core/customer";
import { mockEnabled, notFound, oauthError } from "../../../_mock";

export const dynamic = "force-dynamic";

/**
 * POST /api/dev/line-mock/oauth2/v2.1/verify — LINE's id_token verification endpoint. The mock does not know the
 * channel secret here (LINE does), so it checks issuer / audience / expiry / nonce on the decoded payload only.
 */
export async function POST(req: NextRequest) {
  if (!mockEnabled()) return notFound();
  const form = new URLSearchParams(await req.text());
  const decoded = decodeJwtUnverified(form.get("id_token") ?? "");
  if (!decoded) return oauthError("invalid_request", "Invalid IdToken.");
  const p = decoded.payload;
  if (p.iss !== LINE_ID_TOKEN_ISSUER) return oauthError("invalid_request", "Invalid IdToken Issuer.");
  if (p.aud !== (form.get("client_id") ?? "")) return oauthError("invalid_request", "Invalid IdToken Audience.");
  if (Number(p.exp) * 1000 < Date.now()) return oauthError("invalid_request", "IdToken expired.");
  const nonce = form.get("nonce");
  if (nonce && p.nonce !== nonce) return oauthError("invalid_request", "Invalid IdToken Nonce.");
  return Response.json(p, { headers: { "cache-control": "no-store" } });
}
