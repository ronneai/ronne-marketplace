import type { Locale } from "@/server/domains/identity/models/locale";
/**
 * The Documentation's topics and their sections (feature 033). The Documentation is on the website
 * since 088 (`../ronne-web`, which has the same topics and section ids); inline helpers link into
 * it, so a test can check every link lands on a real section. Change both together.
 */
export const TOPICS = [
  {
    slug: "overview",
    title: "Overview",
    summary: "What Ronne AI Marketplace is, and the path of an item from draft to install.",
    sections: [
      { id: "what", title: "What Ronne AI Marketplace is" },
      { id: "path", title: "The path of an item" },
      { id: "getting-started", title: "Getting started on Home" },
    ],
  },
  {
    slug: "install",
    title: "Installing Ronne",
    summary:
      "Running an instance with Docker or Node, as a service, a domain with HTTPS, the first-run setup and root.",
    sections: [
      { id: "docker", title: "With Docker" },
      { id: "https", title: "A domain and HTTPS" },
      { id: "packages", title: "With apt or dnf" },
      { id: "node", title: "With Node.js" },
      { id: "service", title: "As a service" },
      { id: "windows", title: "Windows" },
      { id: "setup", title: "The setup" },
      { id: "root", title: "Root accounts" },
    ],
  },
  {
    slug: "update",
    title: "Updating Ronne",
    summary:
      "Updating a running instance: the command for each way of installing it, backing up first, and what happens at start.",
    sections: [{ id: "upgrade", title: "Updating Ronne" }],
  },
  {
    slug: "workspaces",
    title: "Workspaces",
    summary: "The level above scopes: who an instance's areas are for, and the global workspace.",
    sections: [
      { id: "what", title: "What a workspace is" },
      { id: "global", title: "The global workspace" },
      { id: "personal", title: "Your personal workspace" },
      { id: "current", title: "Working in one workspace" },
      { id: "visibility", title: "Public and private" },
      { id: "roles", title: "Members and roles" },
      { id: "joining", title: "Joining a workspace" },
      { id: "managing", title: "Creating and managing them" },
      { id: "moving", title: "Moving a scope" },
      { id: "pins", title: "Pinned items" },
    ],
  },
  {
    slug: "scopes",
    title: "Scopes",
    summary: "The part of every item's name that groups it, and how to organise them.",
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
    summary:
      "The 11 kinds of item, what each is for, what an item is made of, and reading one before you install it.",
    sections: [
      { id: "types", title: "The types" },
      { id: "dependencies", title: "Dependencies" },
      { id: "canvas", title: "Composing on a canvas" },
      { id: "manifest", title: "ronne.yaml and the files" },
      { id: "contents", title: "Reading an item before you install it" },
    ],
  },
  {
    slug: "review",
    title: "Submitting and review",
    summary: "From draft to approved: the statuses, the checks and what reviewers look at.",
    sections: [
      { id: "statuses", title: "Statuses" },
      { id: "withdraw", title: "Withdrawing: archive or delete" },
      { id: "checks", title: "The checks at submit" },
      { id: "many", title: "Submitting many at once" },
      { id: "dependencies", title: "Dependencies in review" },
      { id: "reviewing", title: "What reviewers look at" },
      { id: "decisions", title: "Decisions" },
      { id: "approve-many", title: "Approving many at once" },
    ],
  },
  {
    slug: "export",
    title: "Exporting your own items",
    summary:
      "Sending a skill, agent, command, rule or MCP server you wrote in Claude Code, Codex or Cursor to the marketplace as a draft.",
    sections: [
      { id: "what", title: "What it's for" },
      { id: "reads", title: "What it reads, and what it never uploads" },
      { id: "scope", title: "Choosing the scope" },
      { id: "preview", title: "The preview" },
      { id: "descriptions", title: "Descriptions" },
      { id: "keeps", title: "What each type keeps and loses" },
      { id: "dependencies", title: "Dependencies" },
      { id: "next", title: "What arrives, and what to do next" },
      { id: "again", title: "Exporting again" },
      { id: "installed", title: "Items rmk installed" },
      { id: "proposals", title: "Proposing a change" },
      { id: "mcp", title: "From inside your AI tool" },
      { id: "options", title: "Options" },
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
      { id: "release-many", title: "Releasing many at once" },
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
    summary: "What users, moderators, admins and root can do, and where.",
    sections: [
      { id: "roles", title: "The roles" },
      { id: "permissions", title: "Who can do what" },
    ],
  },
  {
    slug: "account",
    title: "Your account",
    summary:
      "How you sign in, with a password or your company's identity provider, two-factor sign-in, and the language of the screens.",
    sections: [
      { id: "signing-in", title: "Signing in" },
      { id: "two-factor", title: "Two-factor sign-in" },
      { id: "language", title: "Language" },
    ],
  },
  {
    slug: "admin",
    title: "Administration",
    summary:
      "For roots: finding users, the instance's settings, and reading the audit log of who did what, and when. Workspaces are managed from their own pages.",
    sections: [
      { id: "users", title: "Users" },
      { id: "settings", title: "Settings" },
      { id: "notice", title: "Notice" },
      { id: "pins", title: "Start here" },
      { id: "audit", title: "Audit log" },
    ],
  },
  {
    slug: "authentication",
    title: "Authentication",
    summary:
      "Signing in with your company's identity provider: setting one up, mapping groups to workspace roles, the password rule, and what to do when a provider breaks.",
    sections: [
      { id: "overview", title: "How it fits together" },
      { id: "providers", title: "Adding a provider" },
      { id: "groups", title: "Groups and workspace roles" },
      { id: "scim", title: "Provisioning with SCIM" },
      { id: "scim-groups", title: "SCIM groups and workspace roles" },
      { id: "scim-endpoints", title: "SCIM endpoints" },
      { id: "password-policy", title: "Password sign-in" },
      { id: "lockout", title: "Lockout and broken providers" },
      { id: "google", title: "Google Workspace" },
      { id: "entra", title: "Microsoft Entra ID" },
      { id: "okta", title: "Okta" },
      { id: "keycloak", title: "Keycloak" },
      { id: "authentik", title: "authentik" },
      { id: "auth0", title: "Auth0" },
      { id: "other-oidc", title: "Other OpenID Connect" },
    ],
  },
  {
    slug: "security",
    title: "Security",
    summary:
      "What an instance defends against, where its secrets are, and what it leaves to the disk and the database.",
    sections: [
      { id: "security", title: "Security" },
      { id: "encryption", title: "Encryption at rest" },
    ],
  },
  {
    slug: "incidents",
    title: "Incidents",
    summary: "The commands made for an incident, and what to do with them.",
    sections: [{ id: "incidents", title: "Incidents" }],
  },
  {
    slug: "backups",
    title: "Backups",
    summary: "Backing an instance up, and restoring it from a backup.",
    sections: [
      { id: "backup", title: "Backups" },
      { id: "restore", title: "Restoring" },
    ],
  },
  {
    slug: "logs",
    title: "Logs",
    summary: "What the server writes, as JSON, and where to read it.",
    sections: [{ id: "logs", title: "Logs" }],
  },
  {
    slug: "monitoring",
    title: "Monitoring",
    summary: "The traces and metrics an instance can send to a collector.",
    sections: [{ id: "monitoring", title: "Monitoring" }],
  },
  {
    slug: "privacy",
    title: "Privacy",
    summary: "What an instance keeps about people, for how long, and how it's purged.",
    sections: [
      { id: "retention", title: "Retention" },
      { id: "erase", title: "Erase an account" },
      { id: "your-data", title: "Your data" },
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
      { id: "web", title: "Signing in with the browser" },
      { id: "installing", title: "Installing" },
      { id: "updating", title: "Keeping items up to date" },
      { id: "files", title: "The files it writes" },
      { id: "edits", title: "Your own edits" },
      { id: "tokens", title: "Tokens and the API" },
      { id: "tools", title: "Your AI tools" },
      { id: "mcp", title: "From inside your AI tool" },
      { id: "plugins", title: "As plugins" },
      { id: "telemetry", title: "Usage reporting" },
    ],
  },
  {
    slug: "plugins",
    title: "Plugin marketplaces",
    summary:
      "Installing released items as plugins: in Claude Code from this website, in Codex and Cursor from a git mirror.",
    sections: [
      { id: "what", title: "What it is" },
      { id: "claude-code", title: "Claude Code" },
      { id: "tokens", title: "Tokens" },
      { id: "mirror", title: "Codex and Cursor (git mirror)" },
      { id: "keeping", title: "Keeping the mirror current" },
      { id: "large", title: "Large marketplaces" },
      { id: "which", title: "Plugins or rmk" },
    ],
  },
  {
    slug: "mcp",
    title: "Registry MCP server",
    summary: "Search and install items by asking your AI tool, with a plan you see first.",
    sections: [
      { id: "what", title: "What it does" },
      { id: "setup", title: "Setting it up" },
      { id: "tools", title: "The tools" },
      { id: "plans", title: "Plans" },
      { id: "access", title: "What it can reach" },
    ],
  },
  {
    slug: "usage",
    title: "Usage data",
    summary: "What rmk reports about the items it installed, who decides, and how to stop it.",
    sections: [
      { id: "what", title: "What it's for" },
      { id: "policy", title: "Who decides" },
      { id: "sent", title: "What is sent" },
      { id: "never", title: "What is never sent" },
      { id: "switch", title: "Turning it off" },
      { id: "tools", title: "What each AI tool reports" },
      { id: "instance", title: "What the instance keeps" },
      { id: "reading", title: "Reading the numbers" },
    ],
  },
  {
    slug: "claude-code",
    title: "Claude Code",
    summary: "Where rmk puts each type of item for Claude Code, and what to know.",
    sections: [
      { id: "paths", title: "Where each type goes" },
      { id: "notes", title: "Good to know" },
      { id: "plugins", title: "Plugins" },
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
      { id: "plugins", title: "Plugins" },
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
      { id: "plugins", title: "Plugins" },
    ],
  },
] as const;

export type Topic = (typeof TOPICS)[number];
export type TopicSlug = Topic["slug"];
export type SectionOf<T extends TopicSlug> = Extract<Topic, { slug: T }>["sections"][number]["id"];

/** How the Documentation's menu groups the topics, in order (owner's request, 2026-09-28). */
export const TOPIC_GROUPS: { label: string; topics: readonly TopicSlug[] }[] = [
  {
    label: "Getting started",
    topics: ["overview", "install", "update", "roles", "account", "admin", "authentication"],
  },
  {
    label: "Installing items",
    topics: ["rmk", "plugins", "mcp", "usage", "claude-code", "codex", "cursor"],
  },
  { label: "Organising", topics: ["workspaces", "scopes", "items"] },
  { label: "Publishing", topics: ["export", "review", "versions", "changes"] },
  {
    label: "Running Ronne",
    topics: ["security", "incidents", "backups", "logs", "monitoring", "privacy"],
  },
];

export const topicOf = (slug: string): Topic | undefined => TOPICS.find((t) => t.slug === slug);

/** The website's address, which the Documentation is under. */
const SITE = "https://www.ronne.ai";

/**
 * The Documentation on the website (088), as links are written: with no language in it. Each link
 * is shown in the person's language by `localizedDocsHref`, where it is drawn.
 */
export const DOCS_URL = `${SITE}/marketplace/docs`;

/**
 * A Documentation address in a language (feature 129): the website keeps each language under its
 * own prefix (`/pt/marketplace/docs/…`), and sends an address without one to the browser's. A
 * link that isn't the Documentation (or only starts like it) is left as it is.
 */
export const localizedDocsHref = (href: string, locale: Locale): string => {
  const rest = href.slice(DOCS_URL.length);
  const isDocs =
    href.startsWith(DOCS_URL) &&
    (rest === "" || rest[0] === "/" || rest[0] === "#" || rest[0] === "?");
  return isDocs ? `${SITE}/${locale}/marketplace/docs${rest}` : href;
};

/** A topic's page on the website, or one of its sections. The overview is the Documentation itself. */
export const docsHref = <T extends TopicSlug>(topic: T, section?: SectionOf<T>) =>
  `${topic === "overview" ? DOCS_URL : `${DOCS_URL}/${topic}`}${section ? `#${section}` : ""}`;
