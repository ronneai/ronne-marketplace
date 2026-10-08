/**
 * One user per test, so the per-email sign-in limit (5 a minute) never trips across tests. The
 * password is a test value for this throwaway instance only.
 */
export const E2E_PASSWORD = "e2e correct horse battery";

export const E2E_USERS = {
  root: "root@e2e.test",
  wrongPassword: "wrong-password@e2e.test",
  remember: "remember@e2e.test",
  signOut: "sign-out@e2e.test",
  changePassword: "change-password@e2e.test",
  notRoot: "not-root@e2e.test",
  tokens: "tokens@e2e.test",
  submitter: "submitter@e2e.test",
  hookAuthor: "hook-author@e2e.test",
  moderator: "moderator@e2e.test",
  releaser: "releaser@e2e.test",
  browser: "browser@e2e.test",
  proposer: "proposer@e2e.test",
  reader: "reader@e2e.test",
  downloader: "downloader@e2e.test",
  installer: "installer@e2e.test",
  composer: "composer@e2e.test",
  exporter: "exporter@e2e.test",
  outsider: "outsider@e2e.test",
  cliExporter: "cli-exporter@e2e.test",
  mcpExporter: "mcp-exporter@e2e.test",
  typesExporter: "types-exporter@e2e.test",
  depsExporter: "deps-exporter@e2e.test",
  depsModerator: "deps-moderator@e2e.test",
  toolsExporter: "tools-exporter@e2e.test",
  changeExporter: "change-exporter@e2e.test",
  changeModerator: "change-moderator@e2e.test",
  bulkSubmitter: "bulk-submitter@e2e.test",
  approveAuthor: "approve-author@e2e.test",
  bulkApprover: "bulk-approver@e2e.test",
  pendingAuthor: "pending-author@e2e.test",
  pendingModerator: "pending-moderator@e2e.test",
  releaseAuthor: "release-author@e2e.test",
  releaseModerator: "release-moderator@e2e.test",
  archiver: "archiver@e2e.test",
  archiveModerator: "archive-moderator@e2e.test",
  decisionAuthor: "decision-author@e2e.test",
  decisionModerator: "decision-moderator@e2e.test",
  workspaceAuthor: "workspace-author@e2e.test",
  workspaceModerator: "workspace-moderator@e2e.test",
  workspaceOutsider: "workspace-outsider@e2e.test",
  // 092: root makes them admin of e2e-acme, and they add the other.
  workspaceAdmin: "workspace-admin@e2e.test",
  memberToAdd: "member-to-add@e2e.test",
  // Phones and tablets (065): one set per project, so the projects' sign-ins don't share a limit.
  phoneMember: "phone-member@e2e.test",
  phoneModerator: "phone-moderator@e2e.test",
  phoneRoot: "phone-root@e2e.test",
  phoneWebkitMember: "phone-webkit-member@e2e.test",
  phoneWebkitModerator: "phone-webkit-moderator@e2e.test",
  phoneWebkitRoot: "phone-webkit-root@e2e.test",
  tabletMember: "tablet-member@e2e.test",
  tabletModerator: "tablet-moderator@e2e.test",
  tabletRoot: "tablet-root@e2e.test",
  // 093: members of the private e2e-vault and people who aren't, one pair per project, and a root
  // who turns e2e-shelf private and back (root's own sign-ins are spent).
  privateMember: "private-member@e2e.test",
  privateOutsider: "private-outsider@e2e.test",
  privateRoot: "private-root@e2e.test",
  phonePrivateMember: "phone-private-member@e2e.test",
  phonePrivateOutsider: "phone-private-outsider@e2e.test",
  phoneWebkitPrivateMember: "phone-webkit-private-member@e2e.test",
  phoneWebkitPrivateOutsider: "phone-webkit-private-outsider@e2e.test",
  tabletPrivateMember: "tablet-private-member@e2e.test",
  tabletPrivateOutsider: "tablet-private-outsider@e2e.test",
} as const;

/** The display names, which the header shows (not the email). */
export const E2E_NAMES: Record<keyof typeof E2E_USERS, string> = {
  root: "Root",
  wrongPassword: "Wrong Password",
  remember: "Remember Me",
  signOut: "Sign Out Tester",
  changePassword: "Change Password Tester",
  notRoot: "Not Root",
  tokens: "Token Tester",
  submitter: "Submitter",
  hookAuthor: "Hook Author",
  moderator: "Mo Moderator",
  releaser: "Rae Releaser",
  browser: "Bea Browser",
  proposer: "Pat Proposer",
  reader: "Rea Reader",
  downloader: "Dan Downloader",
  installer: "Ines Installer",
  composer: "Cam Composer",
  exporter: "Exa Exporter",
  outsider: "Otto Outsider",
  cliExporter: "Cy Exporter",
  mcpExporter: "Mo Exporter",
  typesExporter: "Ty Exporter",
  depsExporter: "Dee Exporter",
  depsModerator: "Dee Moderator",
  toolsExporter: "Tia Exporter",
  changeExporter: "Chan Exporter",
  changeModerator: "Chan Moderator",
  bulkSubmitter: "Bo Bulk",
  approveAuthor: "Ava Author",
  bulkApprover: "Bea Approver",
  pendingAuthor: "Pia Author",
  pendingModerator: "Pim Moderator",
  releaseAuthor: "Rex Author",
  releaseModerator: "Rhea Moderator",
  archiver: "Arlo Archiver",
  archiveModerator: "Ari Moderator",
  decisionAuthor: "Dora Author",
  decisionModerator: "Remy Moderator",
  workspaceAuthor: "Wren Workspace",
  workspaceModerator: "Wes Workspace-Moderator",
  workspaceOutsider: "Otto Outsider",
  workspaceAdmin: "Wade Admin",
  memberToAdd: "Mem Toadd",
  phoneMember: "Pho Member",
  phoneModerator: "Pho Moderator",
  phoneRoot: "Pho Root",
  phoneWebkitMember: "Ios Member",
  phoneWebkitModerator: "Ios Moderator",
  phoneWebkitRoot: "Ios Root",
  tabletMember: "Tab Member",
  tabletModerator: "Tab Moderator",
  tabletRoot: "Tab Root",
  privateMember: "Vera Vault",
  privateOutsider: "Olive Outside",
  privateRoot: "Ruth Root",
  phonePrivateMember: "Pho Vault",
  phonePrivateOutsider: "Pho Outside",
  phoneWebkitPrivateMember: "Ios Vault",
  phoneWebkitPrivateOutsider: "Ios Outside",
  tabletPrivateMember: "Tab Vault",
  tabletPrivateOutsider: "Tab Outside",
};

/** Seeded with the moderator role; everyone else is a user. */
export const E2E_MODERATORS: readonly (keyof typeof E2E_USERS)[] = [
  "moderator",
  "releaser",
  "depsModerator",
  "changeModerator",
  "bulkApprover",
  "pendingModerator",
  "releaseModerator",
  "archiveModerator",
  "decisionModerator",
  "workspaceOutsider",
  "phoneModerator",
  "phoneWebkitModerator",
  "tabletModerator",
];

/** Seeded as root, besides the root setup creates (more than one root since 059). */
export const E2E_ROOTS: readonly (keyof typeof E2E_USERS)[] = [
  "privateRoot",
  "phoneRoot",
  "phoneWebkitRoot",
  "tabletRoot",
];

/**
 * A scope the seed creates, for tests that need one without signing in as root: root already
 * signs in 5 times in a run, the per-email limit a minute.
 */
export const E2E_SCOPE = "e2e-seeded";
/** An empty workspace besides `global` (feature 090), so the phone sweep opens a page with Edit and Delete. */
export const E2E_WORKSPACE = "e2e-team";

/**
 * A workspace with members (091), until 092 lets root add them in the app: `workspaceAuthor` is a
 * user there and `workspaceModerator` its moderator, and only a user in `global`.
 * `workspaceOutsider` moderates `global` only.
 */
export const E2E_ACME = "e2e-acme";
export const E2E_ACME_MEMBERS: Partial<Record<keyof typeof E2E_USERS, "moderator" | "user">> = {
  workspaceAuthor: "user",
  workspaceModerator: "moderator",
};

/**
 * A private workspace (093) with a released skill, `@e2e-vault-tools/vault-deploy`: its members
 * see it with a lock label; to everyone else it doesn't exist.
 */
export const E2E_VAULT = {
  workspace: "e2e-vault",
  scope: "e2e-vault-tools",
  item: "vault-deploy",
  members: [
    "privateMember",
    "phonePrivateMember",
    "phoneWebkitPrivateMember",
    "tabletPrivateMember",
  ] as const satisfies readonly (keyof typeof E2E_USERS)[],
};

/** A public workspace with a released skill, which `privateRoot` makes private and public again. */
export const E2E_SHELF = { workspace: "e2e-shelf", scope: "e2e-shelf-tools", item: "shelf-notes" };

/** An item the seed publishes with two versions (1.0.0 and 1.1.0 on latest), for the Versions page. */
export const E2E_VERSIONED_ITEM = "versioned";

/** A skill the seed publishes with a README and keywords, for the catalogue and item page (018). */
export const E2E_SKILL = "secret-scanner";

/** The skill's busiest day of runs, 3 days ago (047): its Usage card names it as the peak. */
export const E2E_USAGE_PEAK = 42;

/** A skill the seed releases as 1.0.0 with a real artifact, for change proposals (017). */
export const E2E_PROPOSAL_ITEM = "prompt-kit";

/** Items the seed releases with real artifacts for `rmk` (022, 023): an MCP server, an agent that needs it and the skill, and a hook with two versions. */
export const E2E_RMK_ITEMS = {
  mcp: "kit-mcp",
  agent: "kit-agent",
  hook: "kit-hook",
  rule: "kit-rule",
} as const;
