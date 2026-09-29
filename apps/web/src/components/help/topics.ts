/**
 * The Documentation's topics and their sections (feature 033). Shared: the Docs pages render them,
 * and inline helpers link into them, so a test can check every link lands on a real section.
 */
export const TOPICS = [
  {
    slug: "overview",
    title: "Overview",
    summary: "What Ronne AI Marketplace is, and the path of an item from draft to install.",
    sections: [
      { id: "what", title: "What Ronne AI Marketplace is" },
      { id: "path", title: "The path of an item" },
    ],
  },
  {
    slug: "scopes",
    title: "Scopes",
    summary: "The first part of every item's name, and how to organise them.",
    sections: [
      { id: "what", title: "What a scope is" },
      { id: "who", title: "Who creates and uses them" },
      { id: "names", title: "Naming rules" },
      { id: "organising", title: "Ways to organise them" },
    ],
  },
  {
    slug: "items",
    title: "Items and types",
    summary: "The 11 kinds of item, what each is for, and what an item is made of.",
    sections: [
      { id: "types", title: "The types" },
      { id: "dependencies", title: "Dependencies" },
      { id: "manifest", title: "ronne.yaml and the files" },
    ],
  },
  {
    slug: "review",
    title: "Submitting and review",
    summary: "From draft to approved: the statuses, the checks and what reviewers look at.",
    sections: [
      { id: "statuses", title: "Statuses" },
      { id: "checks", title: "The checks at submit" },
      { id: "reviewing", title: "What reviewers look at" },
      { id: "decisions", title: "Decisions" },
    ],
  },
  {
    slug: "versions",
    title: "Versions and tags",
    summary: "Semantic versions, dist-tags, deprecating and yanking.",
    sections: [
      { id: "semver", title: "Versions" },
      { id: "bump", title: "Patch, minor or major" },
      { id: "tags", title: "Tags" },
      { id: "deprecate-yank", title: "Deprecate or yank" },
    ],
  },
  {
    slug: "changes",
    title: "Changing a published item",
    summary: "Change proposals, stale proposals and rebasing.",
    sections: [
      { id: "propose", title: "Proposing a change" },
      { id: "stale", title: "Stale proposals and rebase" },
      { id: "release", title: "Releasing a change" },
    ],
  },
  {
    slug: "roles",
    title: "Roles",
    summary: "What users, moderators and root can do.",
    sections: [
      { id: "roles", title: "The three roles" },
      { id: "permissions", title: "Who can do what" },
    ],
  },
  {
    slug: "rmk",
    title: "Installing with rmk",
    summary: "How items get into your AI tools, and how to keep them current.",
    sections: [
      { id: "what", title: "What rmk does" },
      { id: "getting", title: "Getting rmk" },
      { id: "login", title: "Logging in" },
      { id: "installing", title: "Installing" },
      { id: "updating", title: "Keeping items up to date" },
      { id: "files", title: "The files it writes" },
      { id: "edits", title: "Your own edits" },
      { id: "tokens", title: "Tokens and the API" },
      { id: "tools", title: "Your AI tools" },
    ],
  },
  {
    slug: "claude-code",
    title: "Claude Code",
    summary: "Where rmk puts each type of item for Claude Code, and what to know.",
    sections: [
      { id: "paths", title: "Where each type goes" },
      { id: "notes", title: "Good to know" },
    ],
  },
  {
    slug: "codex",
    title: "Codex",
    summary: "Where rmk puts each type of item for Codex, and what Codex asks of you first.",
    sections: [
      { id: "paths", title: "Where each type goes" },
      { id: "trust", title: "Trust and hook review" },
      { id: "notes", title: "Good to know" },
    ],
  },
  {
    slug: "cursor",
    title: "Cursor",
    summary: "Where rmk puts each type of item for Cursor, and how it works with Claude Code.",
    sections: [
      { id: "paths", title: "Where each type goes" },
      { id: "with-claude-code", title: "With Claude Code" },
      { id: "notes", title: "Good to know" },
    ],
  },
] as const;

export type Topic = (typeof TOPICS)[number];
export type TopicSlug = Topic["slug"];
export type SectionOf<T extends TopicSlug> = Extract<Topic, { slug: T }>["sections"][number]["id"];

/** How the Documentation's menu groups the topics, in order (owner's request, 2026-09-28). */
export const TOPIC_GROUPS: { label: string; topics: readonly TopicSlug[] }[] = [
  { label: "Getting started", topics: ["overview", "roles"] },
  { label: "Organising", topics: ["scopes", "items"] },
  { label: "Publishing", topics: ["review", "versions", "changes"] },
  { label: "Installing", topics: ["rmk", "claude-code", "codex", "cursor"] },
];

export const topicOf = (slug: string): Topic | undefined => TOPICS.find((t) => t.slug === slug);

/** A topic's page, or one of its sections. The overview is `/docs` itself. */
export const docsHref = <T extends TopicSlug>(topic: T, section?: SectionOf<T>) =>
  `${topic === "overview" ? "/docs" : `/docs/${topic}`}${section ? `#${section}` : ""}`;
