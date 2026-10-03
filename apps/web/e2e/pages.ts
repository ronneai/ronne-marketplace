import { TOPICS } from "../src/components/help/topics";
import { E2E_RMK_ITEMS, E2E_SCOPE, E2E_SKILL, E2E_VERSIONED_ITEM } from "./users";

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
  { route: "/docs", roles: EVERYONE, urls: () => ["/docs"] },
  {
    route: "/docs/[topic]",
    roles: ["member"],
    urls: () => TOPICS.map((topic) => `/docs/${topic.slug}`),
  },
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
  { route: "/account/password", roles: EVERYONE, urls: () => ["/account/password"] },
  { route: "/account/tokens", roles: EVERYONE, urls: () => ["/account/tokens"] },
  { route: "/admin", roles: ROOT, urls: () => ["/admin"] },
  { route: "/admin/users", roles: ROOT, urls: () => ["/admin/users"] },
  { route: "/admin/scopes", roles: ROOT, urls: () => ["/admin/scopes"] },
  { route: "/admin/audit", roles: ROOT, urls: () => ["/admin/audit"] },
  { route: "/admin/settings", roles: ROOT, urls: () => ["/admin/settings"] },
  // Root-only in production, which the end-to-end tests run.
  { route: "/styleguide", roles: ROOT, urls: () => ["/styleguide"] },
];
