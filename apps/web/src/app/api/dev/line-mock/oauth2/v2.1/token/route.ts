import type { NextRequest } from "next/server";
import { LINE_ID_TOKEN_ISSUER, pkceChallenge, signHs256Jwt } from "@rentweb/core/customer";
import { findUser, mockEnabled, notFound, oauthError, open, pictureUrl, seal } from "../../../_mock";

export const dynamic = "force-dynamic";

type Code = { u: string; c: string; r: string; ch: string; n: string; s: string; exp: number };

/** POST /api/dev/line-mock/oauth2/v2.1/token — authorization_code + PKCE, answers like LINE (incl. an HS256 id_token). */
export async function POST(req: NextRequest) {
  if (!mockEnabled()) return notFound();
  const form = new URLSearchParams(await req.text());
  if (form.get("grant_type") !== "authorization_code") return oauthError("unsupported_grant_type", "grant_type must be authorization_code");
  const clientId = form.get("client_id") ?? "";
  const clientSecret = form.get("client_secret") ?? "";
  // any well-formed secret is accepted; a secret starting with "bad" simulates a wrong Channel secret
  if (!clientId || !clientSecret || clientSecret.length < 16 || clientSecret.startsWith("bad")) return oauthError("invalid_client", "client authentication failed", 400);
  const code = open<Code>(form.get("code"));
  if (!code) return oauthError("invalid_grant", "invalid or expired authorization code");
  if (code.c !== clientId) return oauthError("invalid_grant", "code was issued to another client");
  if (code.r !== (form.get("redirect_uri") ?? "")) return oauthError("invalid_grant", "redirect_uri mismatch");
  const verifier = form.get("code_verifier") ?? "";
  if (!verifier || pkceChallenge(verifier) !== code.ch) return oauthError("invalid_grant", "PKCE verification failed");
  const user = findUser(code.u);
  if (!user) return oauthError("invalid_grant", "unknown user");

  const origin = `${req.nextUrl.protocol}//${req.headers.get("host") ?? req.nextUrl.host}`;
  const now = Math.floor(Date.now() / 1000);
  const scopes = code.s.split(" ");
  const body: Record<string, unknown> = {
    access_token: seal({ u: user.userId, c: clientId }, 30 * 86400),
    token_type: "Bearer",
    expires_in: 30 * 86400,
    refresh_token: seal({ u: user.userId, c: clientId, refresh: true }, 90 * 86400),
    scope: code.s,
  };
  if (scopes.includes("openid")) {
    body.id_token = signHs256Jwt(
      {
        iss: LINE_ID_TOKEN_ISSUER,
        sub: user.userId,
        aud: clientId,
        exp: now + 3600,
        iat: now,
        ...(code.n ? { nonce: code.n } : {}),
        amr: ["linesso"],
        name: user.displayName,
        picture: pictureUrl(origin, user.userId),
        ...(scopes.includes("email") ? { email: user.email } : {}),
      },
      clientSecret,
    );
  }
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
