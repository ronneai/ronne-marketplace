import { cookies } from "next/headers";
import type { ShellWorkspace } from "@/components/app-shell/nav";
import { parseFolded, SIDEBAR_COOKIE } from "@/components/app-shell/sidebar-cookie";
import { currentFrom, WORKSPACE_COOKIE } from "@/features/current-workspace/current-workspace";
import { parseTheme, THEME_COOKIE } from "@/features/theme/theme";
import { requireUser } from "@/server/domains/identity/actions/session";
import { canInSomeShared } from "@/server/domains/identity/models/permissions";
import { countNeedsReview } from "@/server/domains/submissions/actions/reviews";
import {
  countMovesToAnswer,
  myWorkspacesAs,
  requestsToAnswer,
} from "@/server/domains/workspaces/actions/workspaces";
import { requestHeaders } from "@/server/http/request-headers";

/**
 * What the app frame needs: the signed-in user (feature 006: `src/proxy.ts` only checks for a
 * cookie, so this is where the session is really checked), the theme, the nav counts, the
 * workspaces for the switcher, whether the sidebar is folded (119), and the current workspace
 * (120): the cookie's, if the user is still a member of it. The (app) layout and
 * `/menu` (066) both read it.
 */
export const loadShell = async () => {
  const request = await requestHeaders();
  const user = await requireUser(request);
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const folded = parseFolded(jar.get(SIDEBAR_COOKIE)?.value);
  // Reviewers see how many submissions wait for them next to Reviews (feature 014); their own
  // personal workspace (114) makes nobody a reviewer.
  const needsReview = canInSomeShared(user, "submissions.review")
    ? await countNeedsReview(request)
    : 0;
  // Root and moderators see how many requests to join wait for them next to Requests (094).
  // And the scope moves waiting for them (115): root's, and a shared workspace's admins'.
  const toAnswer = canInSomeShared(user, "access_requests.answer")
    ? (await requestsToAnswer(request)) +
      (user.role === "root" || canInSomeShared(user, "scopes.move")
        ? await countMovesToAnswer(request)
        : 0)
    : 0;
  // The switcher lists the workspaces they're a member of: personal first, then global, then by
  // name (119). Public ones they could join stay on the Workspaces page.
  const workspaces: ShellWorkspace[] = (await myWorkspacesAs(user)).flatMap((w) =>
    w.role ? [{ name: w.name, role: w.role, personal: w.personal }] : [],
  );
  return {
    user,
    theme,
    folded,
    workspaces,
    current: currentFrom(jar.get(WORKSPACE_COOKIE)?.value, workspaces),
    navCounts: { "/reviews": needsReview, "/workspaces/requests": toAnswer },
  };
};
