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
];

/**
 * A scope the seed creates, for tests that need one without signing in as root: root already
 * signs in 5 times in a run, the per-email limit a minute.
 */
export const E2E_SCOPE = "e2e-seeded";

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
