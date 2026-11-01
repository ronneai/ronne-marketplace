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

/**
 * What the sweep creates before it starts: a draft of the member's, and one in review; and the
 * member's personal workspace (114), named from their email.
 */
export type SweepData = {
  draftId: string;
  submissionId: string;
  personal: string;
  /** The member's own id: root opens their page (123). */
  userId: string;
};

export type SweepPage = {
  /** The route as the `app` folder spells it, without route groups: `/items/[scope]/[name]`. */
  route: string;
  /** Who opens it. `signedOut` pages are opened before signing in. */
  roles: readonly SweepRole[] | "signedOut";
  /** The URLs to open for this route, as `role` (the signed-out sweep opens them as a member). */
  urls: (data: SweepData, role: SweepRole) => readonly string[];
  /** Why the main sweep doesn't open it, if it doesn't. */
  skip?: string;
};

const EVERYONE = ["member", "moderator", "root"] as const;
const REVIEWERS = ["moderator", "root"] as const;
const ROOT = ["root"] as const;
const item = (name: string) => `/items/@${E2E_SCOPE}/${name}`;

export const SWEEP_PAGES: readonly SweepPage[] = [
  { route: "/sign-in", roles: "signedOut", urls: () => ["/sign-in"] },
  // The second step (105): shown with or without a challenge; without one, a code says "sign in again".
  {
    route: "/sign-in/two-factor",
    roles: "signedOut",
    urls: () => ["/sign-in/two-factor", "/sign-in/two-factor?method=backup"],
  },
  {
    route: "/setup",
    roles: "signedOut",
    urls: () => ["/setup"],
    skip: "Only on an instance that isn't set up: the wizard project covers it, in each language at 320px (setup-wizard-languages.e2e.ts, 133)",
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
      `${item(E2E_SKILL)}?tab=history`,
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
  { route: "/feedback", roles: EVERYONE, urls: () => ["/feedback", "/feedback?from=%2Fcatalogue"] },
  { route: "/notifications", roles: EVERYONE, urls: () => ["/notifications"] },
  { route: "/submissions", roles: EVERYONE, urls: () => ["/submissions"] },
  { route: "/submissions/new", roles: EVERYONE, urls: () => ["/submissions/new"] },
  {
    route: "/submissions/[id]",
    roles: ["member"],
    // A draft's editor, and the member's submitted one: the review page's screen (137), each tab.
    urls: (data) => [
      `/submissions/${data.draftId}`,
      `/submissions/${data.submissionId}`,
      `/submissions/${data.submissionId}?tab=files`,
      `/submissions/${data.submissionId}?tab=conversation`,
      `/submissions/${data.submissionId}?tab=scan`,
    ],
  },
  { route: "/reviews", roles: REVIEWERS, urls: () => ["/reviews"] },
  {
    route: "/reviews/[id]",
    roles: REVIEWERS,
    // Each tab (137): Overview, Files, Conversation and Security scan.
    urls: (data) => [
      `/reviews/${data.submissionId}`,
      `/reviews/${data.submissionId}?tab=files`,
      `/reviews/${data.submissionId}?tab=conversation`,
      `/reviews/${data.submissionId}?tab=scan`,
    ],
  },
  // Workspaces and their join links (094): a public one, global (where everyone is in), and a
  // name no workspace has, which shows as a private one does.
  {
    route: "/workspaces",
    roles: EVERYONE,
    // Root's is every workspace (115): shared ones, and personal ones with their owners (114).
    urls: (_data, role) =>
      role === "root" ? ["/workspaces", "/workspaces?kind=personal"] : ["/workspaces"],
  },
  {
    route: "/workspaces/[name]",
    roles: EVERYONE,
    // Everyone who sees a workspace (115). Root: its tabs (092), the scopes and global's members,
    // which is everyone, and the member's personal workspace (114). The others: global, with what
    // their role there shows, and the member their own.
    urls: ({ personal }, role) =>
      role === "member"
        ? ["/workspaces/global", `/workspaces/${personal}`, `/workspaces/${E2E_DOOR.workspace}`]
        : role === "moderator"
          ? ["/workspaces/global", "/workspaces/global?tab=requests"]
          : [
              "/workspaces/global",
              // With a pinned item on its shelf (125), and Manage for root.
              `/workspaces/${E2E_DOOR.workspace}`,
              "/workspaces/global?tab=members",
              `/workspaces/${E2E_WORKSPACE}?tab=requests`,
              `/workspaces/${E2E_WORKSPACE}`,
              `/workspaces/${personal}`,
            ],
  },
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
  { route: "/account/security", roles: EVERYONE, urls: () => ["/account/security"] },
  { route: "/account/language", roles: EVERYONE, urls: () => ["/account/language"] },
  { route: "/account/tokens", roles: EVERYONE, urls: () => ["/account/tokens"] },
  { route: "/device", roles: EVERYONE, urls: () => ["/device", "/device?user_code=WDJB-MJHT"] },
  { route: "/admin", roles: ROOT, urls: () => ["/admin"] },
  { route: "/admin/users", roles: ROOT, urls: () => ["/admin/users"] },
  // One user's page (123): the sweep's member.
  { route: "/admin/users/[id]", roles: ROOT, urls: (data) => [`/admin/users/${data.userId}`] },
  { route: "/admin/audit", roles: ROOT, urls: () => ["/admin/audit"] },
  { route: "/admin/feedback", roles: ROOT, urls: () => ["/admin/feedback"] },
  // Its tabs (122): Usage at the bare address, then Plugin feeds and Authentication.
  {
    route: "/admin/settings",
    roles: ROOT,
    urls: () => [
      "/admin/settings",
      "/admin/settings?tab=feeds",
      "/admin/settings?tab=authentication",
      "/admin/settings?tab=privacy",
      // The Notice tab (124): the first tab written in messages.
      "/admin/settings?tab=notice",
      "/admin/settings?tab=scan",
      "/admin/settings?tab=updates",
      "/admin/settings?tab=languages",
      // Add provider (106): the preset cards; identity-providers.mobile.e2e.ts walks the form.
      "/admin/settings?tab=authentication&provider=new",
    ],
  },
  // Root-only in production, which the end-to-end tests run.
  { route: "/styleguide", roles: ROOT, urls: () => ["/styleguide"] },
];

/**
 * The pages the Portuguese and French sweeps skip (feature 133): every other page runs in all three
 * languages, so a new page is swept in each from its first commit. A page is here only with its
 * reason; `src/app/pages-coverage.test.ts` fails on a route that is not a page.
 */
export const ENGLISH_ONLY_ROUTES: Readonly<Record<string, string>> = {
  "/admin": "It only redirects to /admin/users and shows no text.",
  "/styleguide": "A developer's design reference, English by decision (133 SPEC, Out).",
};
