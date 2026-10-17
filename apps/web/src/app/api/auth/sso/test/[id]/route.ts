import { connection } from "next/server";
import { startTestSignInFromRequest } from "@/server/domains/identity/actions/identity-providers";
import { apiRoute } from "@/server/http/api-route";

/**
 * Starts a *Test sign-in* (feature 106): the provider page's button posts here as a plain form in
 * a new tab (a server action would be intercepted and stay in the same tab). Root only, and only
 * from Ronne's own pages (the Origin is checked).
 */
export const POST = apiRoute(
  "/api/auth/sso/test/[id]",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    await connection();
    return startTestSignInFromRequest(request, (await params).id);
  },
);
