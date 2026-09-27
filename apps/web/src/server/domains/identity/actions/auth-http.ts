import { getAppAuth } from "../repositories/auth-instance";
import { type Auth, HTTP_ENDPOINTS } from "../repositories/better-auth";

const BASE_PATH = "/api/auth";

/**
 * Serves /api/auth/*: Better Auth's HTTP endpoints, limited to HTTP_ENDPOINTS. Everything else is a
 * 404, including sign-in and sign-up, so the server actions (and Ronne's rate limit) are the only
 * way to sign in.
 */
export function handleAuthRequest(
  request: Request,
  auth: () => Auth = () => getAppAuth().auth,
): Promise<Response> {
  const path = new URL(request.url).pathname.slice(BASE_PATH.length).replace(/\/+$/, "");
  if (!HTTP_ENDPOINTS.has(path)) return Promise.resolve(new Response("Not Found", { status: 404 }));
  return auth().handler(request);
}
