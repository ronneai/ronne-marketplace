import {
  E2E_DOOR,
  E2E_RMK_ITEMS,
  E2E_SCOPE,
  E2E_SKILL,
  E2E_VERSIONED_ITEM,
  E2E_WORKSPACE,
} from "./users";

/**
 * Every page of the web app, for the phone sweep (feature 065): who can open it, and the URLs to
 * open. A unit test (`src/app/pages-coverage.test.ts`) checks this lists every `page.tsx`, so a
 * new page can't be left out of the sweep.
 */
export type SweepRole = "member" | "moderator" | "root";

/** What the sweep creates before it starts: a draft of the member's, and one in review. */
export type SweepData = { draftId: string; submissionId: string };

export type SweepPage = {
  /** The route as the `app` folder spells it, without route groups: `/items/[scope]/[name]`. */
  route: string;
  /** Who opens it. `signedOut` pages are opened before signing in. */
  roles: readonly SweepRole[] | "signedOut";
  /** The URLs to open for this route. */
  urls: (data: SweepData) => readonly string[];
  /** Why the main sweep doesn't open it, if it doesn't. */
  skip?: string;
};

const EVERYONE = ["member", "moderator", "root"] as const;
const REVIEWERS = ["moderator", "root"] as const;
const ROOT = ["root"] as const;
const item = (name: string) => `/items/@${E2E_SCOPE}/${name}`;

export const SWEEP_PAGES: readonly SweepPage[] = [
  { route: "/sign-in", roles: "signedOut", urls: () => ["/sign-in"] },
  {
    route: "/setup",
    roles: "signedOut",
    urls: () => ["/setup"],
    skip: "Only on an instance that isn't set up: the wizard projects cover it (074 adds phones)",
  },
  { route: "/", roles: EVERYONE, urls: () => ["/"] },
  { route: "/catalogue", roles: EVERYONE, urls: () => ["/catalogue"] },
  // A skill with usage, an agent with dependencies (the canvas), and an item with two versions.
  {
    route: "/items/[scope]/[name]",
    roles: EVERYONE,
    urls: () => [
      item(E2E_SKILL),
      `${item(E2E_SKILL)}?tab=files`,
      item(E2E_RMK_ITEMS.agent),
      item(E2E_VERSIONED_ITEM),
    ],
  },
  {
    route: "/items/[scope]/[name]/versions",
    roles: EVERYONE,
    urls: () => [`${item(E2E_VERSIONED_ITEM)}/versions`],
  },
  // A public workspace's item, under its workspace (118).
  {
    route: "/workspaces/[name]/items/[scope]/[item]",
    roles: EVERYONE,
    urls: () => [`/workspaces/${E2E_DOOR.workspace}/items/${E2E_DOOR.scope}/${E2E_DOOR.item}`],
  },
  {
    route: "/workspaces/[name]/items/[scope]/[item]/versions",
    roles: EVERYONE,
    urls: () => [
      `/workspaces/${E2E_DOOR.workspace}/items/${E2E_DOOR.scope}/${E2E_DOOR.item}/versions`,
    ],
  },
  { route: "/menu", roles: EVERYONE, urls: () => ["/menu"] },
  { route: "/submissions", roles: EVERYONE, urls: () => ["/submissions"] },
  { route: "/submissions/new", roles: EVERYONE, urls: () => ["/submissions/new"] },
  {
    route: "/submissions/[id]",
    roles: ["member"],
    urls: (data) => [`/submissions/${data.draftId}`],
  },
  { route: "/reviews", roles: REVIEWERS, urls: () => ["/reviews"] },
  {
    route: "/reviews/[id]",
    roles: REVIEWERS,
    urls: (data) => [`/reviews/${data.submissionId}`],
  },
  // Workspaces and their join links (094): a public one, global (where everyone is in), and a
  // name no workspace has, which shows as a private one does.
  { route: "/workspaces", roles: EVERYONE, urls: () => ["/workspaces"] },
  {
    route: "/workspaces/[name]/join",
    roles: EVERYONE,
    urls: () => [
      `/workspaces/${E2E_WORKSPACE}/join`,
      "/workspaces/global/join",
      "/workspaces/no-such-team/join",
    ],
  },
  // Requests to join (094): every moderator opens it, with or without requests waiting.
  { route: "/workspaces/requests", roles: REVIEWERS, urls: () => ["/workspaces/requests"] },
  { route: "/account/password", roles: EVERYONE, urls: () => ["/account/password"] },
  { route: "/account/tokens", roles: EVERYONE, urls: () => ["/account/tokens"] },
  { route: "/admin", roles: ROOT, urls: () => ["/admin"] },
  { route: "/admin/users", roles: ROOT, urls: () => ["/admin/users"] },
  { route: "/admin/workspaces", roles: ROOT, urls: () => ["/admin/workspaces"] },
  {
    route: "/admin/workspaces/[name]",
    roles: ROOT,
    // Its two tabs (092): the scopes, and global's members, which is everyone.
    urls: () => [
      "/admin/workspaces/global",
      "/admin/workspaces/global?tab=members",
      `/admin/workspaces/${E2E_WORKSPACE}?tab=requests`,
      `/admin/workspaces/${E2E_WORKSPACE}`,
    ],
  },
  { route: "/admin/scopes", roles: ROOT, urls: () => ["/admin/scopes"] },
  { route: "/admin/audit", roles: ROOT, urls: () => ["/admin/audit"] },
  { route: "/admin/settings", roles: ROOT, urls: () => ["/admin/settings"] },
  // Root-only in production, which the end-to-end tests run.
  { route: "/styleguide", roles: ROOT, urls: () => ["/styleguide"] },
];
