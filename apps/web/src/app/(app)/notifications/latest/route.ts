import { connection } from "next/server";
import { latestNotifications } from "@/server/domains/notifications/actions/notifications";
import { apiRoute } from "@/server/http/api-route";
import { errorResponse } from "@/server/http/errors";
import { requestHeaders } from "@/server/http/request-headers";

/**
 * The ten latest notifications the signed-in person sees, and the unread count (139): what the
 * bell's popover shows when it is opened. Session only, never cached.
 */
export const GET = apiRoute("/notifications/latest", async () => {
  await connection();
  const latest = await latestNotifications(await requestHeaders());
  if (!latest) return errorResponse(401, "unauthorized", "Sign in to see notifications.");
  return Response.json(latest, { headers: { "cache-control": "no-store" } });
});
