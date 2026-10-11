import { safeNextPath } from "@/server/domains/identity/models/route-guard";

/**
 * The current workspace (120): a preference, chosen in the sidebar's switcher and kept in a cookie,
 * that the Catalogue, Reviews and My submissions filter by. It narrows what's shown, never what's
 * allowed: every page and action checks permissions as before.
 */
export const WORKSPACE_COOKIE = "ronne-workspace";

/**
 * Names are compared lowercased: workspace names are stored so (`normalizeWorkspaceName`). An
 * empty value means every workspace: no workspace can be named "", while `all` can (120's
 * adversarial witness).
 */
const nameOf = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

/** The pages it filters, by their path. Everything else is the same whatever it is. */
export const FILTERED_PATHS: readonly string[] = ["/catalogue", "/reviews", "/submissions"];

/** The route the switcher's choices and Show all link to. Works without JavaScript. */
export const CHOOSE_PATH = "/current-workspace";

export const workspaceCookieOptions = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  httpOnly: true,
};

/**
 * The current workspace from the cookie: only one the user is a member of. A stale value (left, a
 * workspace renamed (113) or deleted) or a foreign one counts as none: All workspaces.
 */
export const currentFrom = (
  cookie: string | undefined,
  members: readonly { name: string }[],
): string | null => (cookie && members.some((w) => w.name === cookie) ? cookie : null);

type Param = string | string[] | undefined;

/**
 * What a filtered page shows. `?workspace=` first: a name (any, so a shared link shows what it
 * says; the page's own query only finds what the reader can see), or empty for every workspace.
 * Without it, the current workspace, and the page redirects so the URL says so.
 */
export const viewedWorkspace = (
  param: Param,
  current: string | null,
): { workspace: string | null; redirect: boolean } => {
  const value = Array.isArray(param) ? param[0] : param;
  if (value === undefined) return { workspace: current, redirect: current !== null };
  return { workspace: nameOf(value) || null, redirect: false };
};

/** `path` with `?workspace=` set to `workspace`, the rest of its query kept. */
export const withWorkspace = (
  path: string,
  params: Record<string, Param>,
  workspace: string,
): string => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "workspace" || value === undefined) continue;
    for (const one of [value].flat()) query.append(key, one);
  }
  query.set("workspace", workspace);
  return `${path}?${query}`;
};

/** A switcher choice or Show all, as a link: `set` is a workspace's name, or null for all. */
export const chooseHref = (set: string | null, next: string): string =>
  `${CHOOSE_PATH}?${new URLSearchParams({ set: set ?? "", next })}`;

/**
 * Where the route sends you back: `next` if it's a path on this site (`safeNextPath`, so never off
 * the site), without its `?workspace=`, so a filtered page picks up the new choice.
 */
export const backTo = (next: string | null): string => {
  const safe = safeNextPath(next);
  const url = new URL(safe, "http://ronne.invalid");
  url.searchParams.delete("workspace");
  return `${url.pathname}${url.search}${url.hash}`;
};

/**
 * What the route does with `?set=`: set it (a member's workspace), clear it (empty), or leave it
 * alone (anything else, a workspace the user isn't in included).
 */
export const choiceOf = (
  set: string | null,
  members: readonly { name: string }[],
): { action: "set"; name: string } | { action: "clear" } | { action: "keep" } => {
  const value = nameOf(set);
  if (value === "") return { action: "clear" };
  return members.some((w) => w.name === value)
    ? { action: "set", name: value }
    : { action: "keep" };
};
