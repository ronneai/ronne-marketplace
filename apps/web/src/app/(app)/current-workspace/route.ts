import type { NextRequest } from "next/server";
import {
  backTo,
  choiceOf,
  WORKSPACE_COOKIE,
  workspaceCookieOptions,
} from "@/features/current-workspace/current-workspace";
import { requireUser } from "@/server/domains/identity/actions/session";
import { myWorkspacesAs } from "@/server/domains/workspaces/actions/workspaces";
import { redirectToPath } from "@/server/http/redirect-path";
import { requestHeaders } from "@/server/http/request-headers";

/**
 * Sets or clears the current workspace (120), then goes back: the switcher's choices and Show all
 * are links here, so they work without JavaScript. `?set=` names a workspace the user is a member
 * of (anything else changes nothing); empty, or missing, clears it (Show all). `?next=` must be a
 * path on this site.
 */
export const GET = async (request: NextRequest) => {
  const user = await requireUser(await requestHeaders());
  const members = (await myWorkspacesAs(user)).filter((w) => w.role);
  const params = request.nextUrl.searchParams;
  const choice = choiceOf(params.get("set"), members);
  const response = redirectToPath(backTo(params.get("next")));
  if (choice.action === "set")
    response.cookies.set(WORKSPACE_COOKIE, choice.name, workspaceCookieOptions);
  else if (choice.action === "clear") response.cookies.delete(WORKSPACE_COOKIE);
  return response;
};
