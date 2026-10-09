import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE } from "@/features/theme/theme";
import { requireUser } from "@/server/domains/identity/actions/session";
import { canInSome } from "@/server/domains/identity/models/permissions";
import { countNeedsReview } from "@/server/domains/submissions/actions/reviews";
import { requestsToAnswer } from "@/server/domains/workspaces/actions/workspaces";
import { requestHeaders } from "@/server/http/request-headers";

/**
 * What the app frame needs: the signed-in user (feature 006: `src/proxy.ts` only checks for a
 * cookie, so this is where the session is really checked), the theme, and the nav counts. The
 * (app) layout and `/menu` (066) both read it.
 */
export const loadShell = async () => {
  const request = await requestHeaders();
  const user = await requireUser(request);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  // Reviewers see how many submissions wait for them next to Reviews (feature 014).
  const needsReview = canInSome(user, "submissions.review") ? await countNeedsReview(request) : 0;
  // Root and moderators see how many requests to join wait for them next to Requests (094).
  const toAnswer = canInSome(user, "access_requests.answer") ? await requestsToAnswer(request) : 0;
  return {
    user,
    theme,
    navCounts: { "/reviews": needsReview, "/workspaces/requests": toAnswer },
  };
};
