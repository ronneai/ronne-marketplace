import { connection } from "next/server";
import { unreadCount } from "@/server/domains/notifications/actions/notifications";
import { apiRoute } from "@/server/http/api-route";
import { errorResponse } from "@/server/http/errors";
import { requestHeaders } from "@/server/http/request-headers";

/**
 * How many unread notifications the signed-in person sees (139): the bell's badge, asked for every
 * minute while a page is open. Session only (not `/api/v1`: `rmk` and the MCP server have no
 * notifications), and never cached.
 */
export const GET = apiRoute("/notifications/count", async () => {
  await connection();
  const count = await unreadCount(await requestHeaders());
  if (count === null) return errorResponse(401, "unauthorized", "Sign in to see notifications.");
  return Response.json({ count }, { headers: { "cache-control": "no-store" } });
});
