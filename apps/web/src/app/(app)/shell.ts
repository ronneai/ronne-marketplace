import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { ShellWorkspace } from "@/components/app-shell/nav";
import { parseFolded, SIDEBAR_COOKIE } from "@/components/app-shell/sidebar-cookie";
import {
  currentFrom,
  viewedWorkspace,
  WORKSPACE_COOKIE,
  withWorkspace,
} from "@/features/current-workspace/current-workspace";
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
 * (120): the cookie's, if the user is still a member of it. The (app) layout, `/menu` (066) and
 * the filtered pages (120) read it; `cache` runs it once per request.
 */
export const loadShell = cache(async () => {
  const request = await requestHeaders();
  const user = await requireUser(request);
  // The two-factor hold (105) is each page's first step (`holdPage` in hold.ts), not here: a
  // layout isn't rendered again on client-side navigation, and redirecting from it after a server
  // action's redirect rendered a blank page.
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
});

/**
 * What a filtered page (120) shows: `?workspace=` first, else the current workspace, redirecting
 * so the URL says it. `fixed` is what the page's links must keep: the workspace shown, or an empty
 * `?workspace=` while a current workspace is set and every workspace is shown (left out, the next
 * page would redirect to the current one). `keepAll`: a current workspace is set, so a link that
 * means every workspace must say so with an empty `?workspace=` (the catalogue's clear links).
 */
export const workspaceView = async (
  path: string,
  params: Record<string, string | string[] | undefined>,
) => {
  const { current, workspaces } = await loadShell();
  const view = viewedWorkspace(params.workspace, current);
  if (view.redirect && view.workspace) redirect(withWorkspace(path, params, view.workspace));
  const keepAll = current !== null;
  const fixed: Record<string, string> = view.workspace
    ? { workspace: view.workspace }
    : current !== null
      ? { workspace: "" }
      : {};
  return {
    workspace: view.workspace,
    keepAll,
    fixed,
    workspaces,
  };
};
