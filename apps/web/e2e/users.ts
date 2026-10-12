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
  // Folds the sidebar and opens the workspace switcher (119).
  sidebar: "sidebar@e2e.test",
  // Work in one workspace (120): a moderator of e2e-focus per project.
  focusModerator: "focus-moderator@e2e.test",
  phoneFocus: "phone-focus@e2e.test",
  phoneWebkitFocus: "phone-webkit-focus@e2e.test",
  tabletFocus: "tablet-focus@e2e.test",
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
  // Two same-named items in two workspaces (118), on desktop and on a phone.
  twinReader: "twin-reader@e2e.test",
  renamer: "renamer@e2e.test",
  phoneRenamer: "phone-renamer@e2e.test",
  phoneWebkitRenamer: "phone-webkit-renamer@e2e.test",
  tabletRenamer: "tablet-renamer@e2e.test",
  phoneTwinReader: "phone-twin-reader@e2e.test",
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
  // #142: saves a draft that Submit would refuse, and sees why; one per project, so their sign-ins
  // don't share a limit with the projects' members.
  problemsAuthor: "problems-author@e2e.test",
  phoneProblems: "phone-problems@e2e.test",
  phoneWebkitProblems: "phone-webkit-problems@e2e.test",
  tabletProblems: "tablet-problems@e2e.test",
  // 112: two drafts that need each other, submitted, approved, released and installed together;
  // an author and a moderator per project, so their sign-ins have the limit to themselves. Their
  // emails sort after root's: Admin › Users lists 50 by email, and user-admin finds root's row on
  // the first page.
  togetherAuthor: "together-author@e2e.test",
  togetherModerator: "together-moderator@e2e.test",
  phoneTogether: "together-phone@e2e.test",
  phoneTogetherModerator: "together-phone-moderator@e2e.test",
  phoneWebkitTogether: "together-ios@e2e.test",
  phoneWebkitTogetherModerator: "together-ios-moderator@e2e.test",
  tabletTogether: "together-tablet@e2e.test",
  tabletTogetherModerator: "together-tablet-moderator@e2e.test",
  // #143: picks an exact version in the dependency menu, one per project. After root's email too.
  versionPinAuthor: "version-pin-author@e2e.test",
  phoneVersionPin: "version-pin-phone@e2e.test",
  phoneWebkitVersionPin: "version-pin-ios@e2e.test",
  tabletVersionPin: "version-pin-tablet@e2e.test",
  // #141: installs an item whose newest dependency conflicts, with rmk. After root's email too.
  versionFallback: "version-fallback@e2e.test",
  // 094: asks to join e2e-join, and its moderator approves; a pair per project. After root's email.
  joinAsker: "workspace-join-asker@e2e.test",
  joinModerator: "workspace-join-moderator@e2e.test",
  phoneJoinAsker: "workspace-join-phone-asker@e2e.test",
  phoneJoinModerator: "workspace-join-phone-moderator@e2e.test",
  phoneWebkitJoinAsker: "workspace-join-ios-asker@e2e.test",
  phoneWebkitJoinModerator: "workspace-join-ios-moderator@e2e.test",
  tabletJoinAsker: "workspace-join-tablet-asker@e2e.test",
  tabletJoinModerator: "workspace-join-tablet-moderator@e2e.test",
  // 094: not in e2e-door, so Propose a change on its item offers Ask to join.
  proposeOutsider: "workspace-propose-outsider@e2e.test",
  // 114: releases in their personal workspace, which another user can't see; a pair per project.
  // After root's email.
  solo: "solo@e2e.test",
  soloOutsider: "solo-outsider@e2e.test",
  phoneSolo: "solo-phone@e2e.test",
  phoneSoloOutsider: "solo-phone-outsider@e2e.test",
  phoneWebkitSolo: "solo-ios@e2e.test",
  phoneWebkitSoloOutsider: "solo-ios-outsider@e2e.test",
  tabletSolo: "solo-tablet@e2e.test",
  tabletSoloOutsider: "solo-tablet-outsider@e2e.test",
  // 115: an owner who asks to move a personal scope into a team workspace, its admin, who
  // approves, and a root who moves one directly; a set per project. After root's email.
  scopeMover: "scope-mover@e2e.test",
  scopeMoveAdmin: "scope-move-admin@e2e.test",
  scopeMoveRoot: "scope-move-root@e2e.test",
  phoneScopeMover: "scope-mover-phone@e2e.test",
  phoneScopeMoveAdmin: "scope-move-admin-phone@e2e.test",
  phoneScopeMoveRoot: "scope-move-root-phone@e2e.test",
  phoneWebkitScopeMover: "scope-mover-ios@e2e.test",
  phoneWebkitScopeMoveAdmin: "scope-move-admin-ios@e2e.test",
  phoneWebkitScopeMoveRoot: "scope-move-root-ios@e2e.test",
  tabletScopeMover: "scope-mover-tablet@e2e.test",
  tabletScopeMoveAdmin: "scope-move-admin-tablet@e2e.test",
  tabletScopeMoveRoot: "scope-move-root-tablet@e2e.test",
} as const;

/** The display names, which the header shows (not the email). */
export const E2E_NAMES: Record<keyof typeof E2E_USERS, string> = {
  root: "Root",
  wrongPassword: "Wrong Password",
  remember: "Remember Me",
  signOut: "Sign Out Tester",
  sidebar: "Sid Sidebar",
  focusModerator: "Fay Focus",
  phoneFocus: "Phoebe Focus",
  phoneWebkitFocus: "Wendy Focus",
  tabletFocus: "Tabitha Focus",
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
  twinReader: "Tia Twin",
  renamer: "Ren Amer",
  phoneRenamer: "Phone Renamer",
  phoneWebkitRenamer: "Phone WebKit Renamer",
  tabletRenamer: "Tablet Renamer",
  phoneTwinReader: "Pip Twin",
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
  problemsAuthor: "Pia Problems",
  phoneProblems: "Phone Problems",
  phoneWebkitProblems: "Ios Problems",
  tabletProblems: "Tab Problems",
  togetherAuthor: "Tog Author",
  togetherModerator: "Tog Moderator",
  phoneTogether: "Phone Together",
  phoneTogetherModerator: "Phone Together Mod",
  phoneWebkitTogether: "Ios Together",
  phoneWebkitTogetherModerator: "Ios Together Mod",
  tabletTogether: "Tab Together",
  tabletTogetherModerator: "Tab Together Mod",
  versionPinAuthor: "Pin Author",
  phoneVersionPin: "Phone Pin",
  phoneWebkitVersionPin: "Ios Pin",
  tabletVersionPin: "Tab Pin",
  versionFallback: "Val Fallback",
  joinAsker: "Jo Asker",
  joinModerator: "Jo Moderator",
  phoneJoinAsker: "Phone Asker",
  phoneJoinModerator: "Phone Join Mod",
  phoneWebkitJoinAsker: "Ios Asker",
  phoneWebkitJoinModerator: "Ios Join Mod",
  tabletJoinAsker: "Tab Asker",
  tabletJoinModerator: "Tab Join Mod",
  proposeOutsider: "Pro Outsider",
  solo: "Solo",
  soloOutsider: "Solo Outsider",
  phoneSolo: "Phone Solo",
  phoneSoloOutsider: "Phone Solo Outsider",
  phoneWebkitSolo: "iOS Solo",
  phoneWebkitSoloOutsider: "iOS Solo Outsider",
  tabletSolo: "Tablet Solo",
  tabletSoloOutsider: "Tablet Solo Outsider",
  scopeMover: "Scope Mover",
  scopeMoveAdmin: "Move Admin",
  scopeMoveRoot: "Move Root",
  phoneScopeMover: "Phone Scope Mover",
  phoneScopeMoveAdmin: "Phone Move Admin",
  phoneScopeMoveRoot: "Phone Move Root",
  phoneWebkitScopeMover: "iOS Scope Mover",
  phoneWebkitScopeMoveAdmin: "iOS Move Admin",
  phoneWebkitScopeMoveRoot: "iOS Move Root",
  tabletScopeMover: "Tablet Scope Mover",
  tabletScopeMoveAdmin: "Tablet Move Admin",
  tabletScopeMoveRoot: "Tablet Move Root",
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
  "togetherModerator",
  "phoneTogetherModerator",
  "phoneWebkitTogetherModerator",
  "tabletTogetherModerator",
];

/** Seeded as root, besides the root setup creates (more than one root since 059). */
export const E2E_ROOTS: readonly (keyof typeof E2E_USERS)[] = [
  "privateRoot",
  "scopeMoveRoot",
  "phoneScopeMoveRoot",
  "phoneWebkitScopeMoveRoot",
  "tabletScopeMoveRoot",
  "phoneRoot",
  "phoneWebkitRoot",
  "tabletRoot",
];

/**
 * A scope the seed creates, for tests that need one without signing in as root: root already
 * signs in 5 times in a run, the per-email limit a minute.
 */
export const E2E_SCOPE = "e2e-seeded";
/**
 * A public workspace people ask to join (094): each project's join moderator moderates it, and its
 * asker isn't in it until the moderator approves.
 */
export const E2E_JOIN = "e2e-join";
export const E2E_JOIN_MODERATORS: readonly (keyof typeof E2E_USERS)[] = [
  "joinModerator",
  "phoneJoinModerator",
  "phoneWebkitJoinModerator",
  "tabletJoinModerator",
];
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

/**
 * Two public workspaces with a released skill each (120), the same moderators in both, one per
 * project, who choose `e2e-focus` as their current workspace. Each workspace holds a draft of each
 * moderator's (`<draft>-<project>`) and a submission waiting for review (`waiting`), so a filtered
 * page can be seen keeping one workspace's and dropping the other's.
 */
export const E2E_FOCUS = {
  workspace: "e2e-focus",
  scope: "e2e-focus-tools",
  item: "focus-notes",
  draft: "focus-draft",
  waiting: "focus-waiting",
  other: {
    workspace: "e2e-focus-other",
    scope: "e2e-other-tools",
    item: "other-notes",
    draft: "other-draft",
    waiting: "other-waiting",
  },
  moderators: {
    chromium: "focusModerator",
    phone: "phoneFocus",
    "phone-webkit": "phoneWebkitFocus",
    tablet: "tabletFocus",
  },
} as const satisfies {
  workspace: string;
  scope: string;
  item: string;
  draft: string;
  waiting: string;
  other: { workspace: string; scope: string; item: string; draft: string; waiting: string };
  moderators: Record<string, keyof typeof E2E_USERS>;
};

/** A public workspace with a released skill, which `privateRoot` makes private and public again. */
export const E2E_SHELF = { workspace: "e2e-shelf", scope: "e2e-shelf-tools", item: "shelf-notes" };
/** A public workspace with a released skill nobody seeded is in (094): Propose a change refuses. */
export const E2E_DOOR = { workspace: "e2e-door", scope: "e2e-door-tools", item: "door-notes" };
/**
 * Two items of one scope and name (118): global's rule `@e2e-seeded/twin-notes`, and a public
 * workspace's skill under the same scope and name, `@e2e-twin/e2e-seeded/twin-notes`.
 */
export const E2E_TWIN = { workspace: "e2e-twin", scope: "e2e-seeded", item: "twin-notes" };

/** An old name of the workspace's twin skill (118), as if it had been renamed: it still answers. */
export const E2E_TWIN_OLD_NAME = "@e2e-seeded/twin-skill";

/** An item the seed publishes with two versions (1.0.0 and 1.1.0 on latest), for the Versions page. */
export const E2E_VERSIONED_ITEM = "versioned";

/** A skill the seed publishes with a README and keywords, for the catalogue and item page (018). */
export const E2E_SKILL = "secret-scanner";

/** The skill's busiest day of runs, 3 days ago (047): its Usage card names it as the peak. */
export const E2E_USAGE_PEAK = 42;

/** A skill the seed releases as 1.0.0 with a real artifact, for change proposals (017). */
export const E2E_PROPOSAL_ITEM = "prompt-kit";

/**
 * Issue #141's registry, released with real artifacts: fallback-a 1.1.0 needs fallback-b ^1.0.0,
 * and fallback-b 1.2.0, released later, pins fallback-a to 1.0.0. Only fallback-b 1.1.0 works.
 */
export const E2E_FALLBACK_ITEMS = { a: "fallback-a", b: "fallback-b" } as const;

/** Items the seed releases with real artifacts for `rmk` (022, 023): an MCP server, an agent that needs it and the skill, and a hook with two versions. */
export const E2E_RMK_ITEMS = {
  mcp: "kit-mcp",
  agent: "kit-agent",
  hook: "kit-hook",
  rule: "kit-rule",
} as const;

/**
 * One workspace per project for renaming (113), each with a released skill and its admin, who
 * renames it to `e2e-renamed-<project>`: a rename changes what other tests would find, so no other
 * test uses these.
 */
export const E2E_RENAME = {
  scope: "e2e-rename-tools",
  item: "rename-notes",
  projects: {
    chromium: "renamer",
    phone: "phoneRenamer",
    "phone-webkit": "phoneWebkitRenamer",
    tablet: "tabletRenamer",
  } as const satisfies Record<string, keyof typeof E2E_USERS>,
  workspace: (project: string) => `e2e-rename-${project}`,
  renamed: (project: string) => `e2e-renamed-${project}`,
};

/**
 * Personal workspaces (114): per project, a user who creates a scope in theirs, submits, releases
 * and sees the item, and another who gets not found for it. Each personal workspace is named from
 * its owner's email.
 */
export const E2E_PERSONAL = {
  scope: "solo-tools",
  item: "solo-notes",
  projects: {
    chromium: { owner: "solo", outsider: "soloOutsider" },
    phone: { owner: "phoneSolo", outsider: "phoneSoloOutsider" },
    "phone-webkit": { owner: "phoneWebkitSolo", outsider: "phoneWebkitSoloOutsider" },
    tablet: { owner: "tabletSolo", outsider: "tabletSoloOutsider" },
  } as const satisfies Record<
    string,
    { owner: keyof typeof E2E_USERS; outsider: keyof typeof E2E_USERS }
  >,
  /** The owner's personal workspace: their email's local part. */
  workspace: (owner: keyof typeof E2E_USERS) => E2E_USERS[owner].split("@")[0] ?? "",
};

/**
 * Moving scopes (115): per project, a team workspace its admin runs, a scope in the owner's
 * personal workspace that the owner asks to move into it, and a scope in `global` that root moves
 * there directly.
 */
/** In global for good (115): 64 characters with no hyphen, for the phone sweep. */
export const E2E_LONG_SCOPE = "e2elongscope".padEnd(64, "l");

export const E2E_MOVE = {
  personalScope: "mover-tools",
  projects: {
    chromium: { owner: "scopeMover", admin: "scopeMoveAdmin", root: "scopeMoveRoot" },
    phone: { owner: "phoneScopeMover", admin: "phoneScopeMoveAdmin", root: "phoneScopeMoveRoot" },
    "phone-webkit": {
      owner: "phoneWebkitScopeMover",
      admin: "phoneWebkitScopeMoveAdmin",
      root: "phoneWebkitScopeMoveRoot",
    },
    tablet: {
      owner: "tabletScopeMover",
      admin: "tabletScopeMoveAdmin",
      root: "tabletScopeMoveRoot",
    },
  } as const satisfies Record<
    string,
    { owner: keyof typeof E2E_USERS; admin: keyof typeof E2E_USERS; root: keyof typeof E2E_USERS }
  >,
  // The longest names there can be (64 characters), with no hyphen to break at: the Move dialog
  // must still fit its screen (115).
  team: (project: string) => `e2emoveteam${project.replaceAll("-", "")}`.padEnd(64, "t"),
  rootScope: (project: string) => `e2emoveroot${project.replaceAll("-", "")}`.padEnd(64, "r"),
  /** The owner's personal workspace: their email's local part (114). */
  personal: (owner: keyof typeof E2E_USERS) => E2E_USERS[owner].split("@")[0] ?? "",
};
