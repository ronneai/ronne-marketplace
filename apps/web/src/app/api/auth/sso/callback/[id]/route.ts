import { connection } from "next/server";
import { completeSsoSignIn } from "@/server/domains/identity/actions/sso";
import { apiRoute } from "@/server/http/api-route";

/**
 * Where an identity provider sends the browser back (feature 106): Ronne's own route, beside
 * Better Auth's catch-all (which stays limited to its allowlist). Its address is the redirect URI
 * root registers at the provider.
 */
export const GET = apiRoute(
  "/api/auth/sso/callback/[id]",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    await connection();
    return completeSsoSignIn(request, (await params).id);
  },
);
