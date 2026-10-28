/**
 * One user per test, so the per-email sign-in limit (5 a minute) never trips across tests. The
 * password is a test value for this throwaway instance only.
 */
export const E2E_PASSWORD = "e2e correct horse battery";

/** The other passwords the tests type (the setup's root, a wrong one, a new one): never in a log line. */
export const E2E_SETUP_PASSWORD = "correct horse battery";
export const E2E_WRONG_PASSWORD = "not the password at all";
export const E2E_NEW_PASSWORD = "a brand new e2e passphrase";

export const E2E_USERS = {
  root: "root@e2e.test",
  // Sets up an identity provider and Root only (106): its own root, as root's sign-ins are spent.
  ssoRoot: "sso-root@e2e.test",
  // Refused a password under Root only (106).
  ssoMember: "sso-member@e2e.test",
  phoneSsoMember: "phone-sso-member@e2e.test",
  phoneWebkitSsoMember: "phone-webkit-sso-member@e2e.test",
  tabletSsoMember: "tablet-sso-member@e2e.test",
  // Each device project's own root for the SSO flow: the project's root is signed in five times.
  phoneSsoRoot: "phone-sso-root@e2e.test",
  phoneWebkitSsoRoot: "phone-webkit-sso-root@e2e.test",
  tabletSsoRoot: "tablet-sso-root@e2e.test",
  wrongPassword: "wrong-password@e2e.test",
  remember: "remember@e2e.test",
  signOut: "sign-out@e2e.test",
  // Folds the sidebar and opens the workspace switcher (119).
  sidebar: "sidebar@e2e.test",
  // Reads the shell in Portuguese and French (129): a moderator, who sees the Reviews link. One per
  // device project too, signed in once and reused for the other languages.
  languages: "languages@e2e.test",
  // 130: reads the Catalogue, an item and the Workspaces pages in Portuguese and French.
  browseLanguages: "browse-languages@e2e.test",
  // 133: reads Home, Account, Feedback, the menu and sign-in in Portuguese and French.
  restLanguages: "rest-languages@e2e.test",
  // 131: writes, submits and reviews in Portuguese and French: a moderator, for the review queue.
  authorLanguages: "author-languages@e2e.test",
  // 132: reads Admin (Users, a user, the Audit log, every Settings tab) in Portuguese and French: a root.
  adminLanguages: "admin-languages@e2e.test",
  // Choose a language on Account › Language and Save (129): one with JavaScript, one without. Each
  // changes its own profile, so neither can be shared.
  languageChooser: "language-chooser@e2e.test",
  languageNoJs: "language-no-js@e2e.test",
  // The language links on sign-in (129): one without a saved language, one with.
  languageSwitcher: "language-switcher@e2e.test",
  languageSaved: "language-saved@e2e.test",
  phoneLanguages: "phone-languages@e2e.test",
  phoneWebkitLanguages: "phone-webkit-languages@e2e.test",
  tabletLanguages: "tablet-languages@e2e.test",
  // Work in one workspace (120): a moderator of e2e-focus per project.
  focusModerator: "focus-moderator@e2e.test",
  phoneFocus: "phone-focus@e2e.test",
  phoneWebkitFocus: "phone-webkit-focus@e2e.test",
  tabletFocus: "tablet-focus@e2e.test",
  // Shelves on a desktop browser (125): a workspace's admin and members, root, and two people
  // who star items, one with JavaScript and one without.
  shelvesAdmin: "shelves-admin@e2e.test",
  shelvesMember: "shelves-member@e2e.test",
  shelvesVault: "shelves-vault@e2e.test",
  shelvesOutsider: "shelves-outsider@e2e.test",
  shelvesRoot: "shelves-root@e2e.test",
  // Getting started (126): hides the checklist on Home and brings it back from Account.
  starterAccount: "starter-account@e2e.test",
  // Reads Home's checklist on a phone and a tablet (126): one fresh user per device project.
  // The whole walk-through of the checklist (126): a fresh user per project, one without JavaScript.
  starterFlow: "starter-flow@e2e.test",
  starterNoJs: "starter-no-js@e2e.test",
  phoneStarterFlow: "phone-starter-flow@e2e.test",
  phoneWebkitStarterFlow: "phone-webkit-starter-flow@e2e.test",
  tabletStarterFlow: "tablet-starter-flow@e2e.test",
  phoneStarter: "phone-starter@e2e.test",
  phoneWebkitStarter: "phone-webkit-starter@e2e.test",
  tabletStarter: "tablet-starter@e2e.test",
  favoriter: "favoriter@e2e.test",
  favoriterNoJs: "favoriter-no-js@e2e.test",
  // Pin items for a workspace (125): an admin of e2e-pins per project.
  pinsAdmin: "pins-admin@e2e.test",
  phonePinsAdmin: "phone-pins-admin@e2e.test",
  phoneWebkitPinsAdmin: "phone-webkit-pins-admin@e2e.test",
  tabletPinsAdmin: "tablet-pins-admin@e2e.test",
  changePassword: "change-password@e2e.test",
  // Turns two-factor on and off on /account/security (105).
  twoFactor: "two-factor@e2e.test",
  // Held on /account/security while root requires two-factor of everyone (105).
  twoFactorHeld: "two-factor-held@e2e.test",
  // A moderator held under "Reviewers and root" until they enrol, and one root resets (105).
  twoFactorModerator: "two-factor-moderator@e2e.test",
  // A root of its own for the requirement's test, so root@e2e.test isn't signed in once more.
  twoFactorRoot: "two-factor-root@e2e.test",
  twoFactorResettable: "two-factor-resettable@e2e.test",
  // Each phone and tablet project enrols and signs in with a code (105).
  phoneTwoFactor: "phone-two-factor@e2e.test",
  phoneWebkitTwoFactor: "phone-webkit-two-factor@e2e.test",
  tabletTwoFactor: "tablet-two-factor@e2e.test",
  // `rmk login --web` (107): someone who approves codes, and someone who turns two-factor on first.
  device: "device@e2e.test",
  deviceTwoFactor: "device-two-factor@e2e.test",
  phoneDevice: "phone-device@e2e.test",
  phoneDeviceTwoFactor: "phone-device-two-factor@e2e.test",
  phoneWebkitDevice: "phone-webkit-device@e2e.test",
  phoneWebkitDeviceTwoFactor: "phone-webkit-device-two-factor@e2e.test",
  tabletDevice: "tablet-device@e2e.test",
  tabletDeviceTwoFactor: "tablet-device-two-factor@e2e.test",
  // The instance notice (124): a root who sets it and a member who sees and dismisses it, and a
  // root per phone and tablet project, who sets it and reads it on the device.
  // Reads Home on a populated instance (124).
  homeMember: "home-member@e2e.test",
  // Copies a card's install command from Home (126): its own, as homeMember's sign-ins are spent.
  homeCopier: "home-copier@e2e.test",
  homeCards: "home-cards@e2e.test",
  // Switches the Catalogue between the grid and the list (126).
  catalogueView: "catalogue-view@e2e.test",
  catalogueViewNoJs: "catalogue-view-no-js@e2e.test",
  // Send feedback (127): from the sidebar dialog, and from the page without JavaScript.
  feedbackSender: "feedback-sender@e2e.test",
  feedbackNoJs: "feedback-no-js@e2e.test",
  // Reads the inbox in Admin (127): a root of its own, who also sends three messages first.
  feedbackRoot: "feedback-root@e2e.test",
  // Reaches the hourly limit (127), and an account root erases after it sent feedback.
  feedbackLimit: "feedback-limit@e2e.test",
  feedbackErasable: "feedback-erasable@e2e.test",
  // Sends feedback from the Menu on a phone and a tablet (127): one per device project.
  phoneFeedback: "phone-feedback@e2e.test",
  phoneWebkitFeedback: "phone-webkit-feedback@e2e.test",
  tabletFeedback: "tablet-feedback@e2e.test",
  // Root asked each to choose a new password (128): the seed sets the request, and the test is held
  // on the change page. One per device project.
  mustChange: "must-change@e2e.test",
  // Also required to use two-factor (128): the password comes first, then two-factor.
  mustChangeTwoFactor: "must-change-two-factor@e2e.test",
  // Root's own, who asks for and stops asking for a new password of mustChangeAsk (128).
  mustChangeRoot: "must-change-root@e2e.test",
  mustChangeAsk: "must-change-ask@e2e.test",
  phoneMustChange: "phone-must-change@e2e.test",
  phoneWebkitMustChange: "phone-webkit-must-change@e2e.test",
  tabletMustChange: "tablet-must-change@e2e.test",
  noticeRoot: "notice-root@e2e.test",
  noticeMember: "notice-member@e2e.test",
  phoneNoticeRoot: "phone-notice-root@e2e.test",
  phoneWebkitNoticeRoot: "phone-webkit-notice-root@e2e.test",
  tabletNoticeRoot: "tablet-notice-root@e2e.test",
  notRoot: "not-root@e2e.test",
  tokens: "tokens@e2e.test",
  submitter: "submitter@e2e.test",
  hookAuthor: "hook-author@e2e.test",
  moderator: "moderator@e2e.test",
  releaser: "releaser@e2e.test",
  // Root erases them (103): they published an item and commented on a review first.
  erasable: "erasable@e2e.test",
  // Downloads their own data (104): they published a rule and commented on a review.
  dataOwner: "data-owner@e2e.test",
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
  // The security scan (135): a root who turns it on and reviews, and an author who submits a skill.
  scanRoot: "scan-root@e2e.test",
  scanAuthor: "scan-author@e2e.test",
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
  // 134: a member who asks to move an item to another scope, and a moderator who moves one at
  // once and answers; a pair per project. After root's email, and named after Root.
  scopeItemMover: "scope-item-mover@e2e.test",
  scopeItemModerator: "scope-item-moderator@e2e.test",
  phoneScopeItemMover: "scope-item-mover-phone@e2e.test",
  phoneScopeItemModerator: "scope-item-moderator-phone@e2e.test",
  phoneWebkitScopeItemMover: "scope-item-mover-ios@e2e.test",
  phoneWebkitScopeItemModerator: "scope-item-moderator-ios@e2e.test",
  tabletScopeItemMover: "scope-item-mover-tablet@e2e.test",
  tabletScopeItemModerator: "scope-item-moderator-tablet@e2e.test",
} as const;

/** The display names, which the header shows (not the email). */
export const E2E_NAMES: Record<keyof typeof E2E_USERS, string> = {
  root: "Root",
  ssoRoot: "SSO Root",
  ssoMember: "SSO Member",
  phoneSsoMember: "Phone SSO Member",
  phoneWebkitSsoMember: "Phone WebKit SSO Member",
  tabletSsoMember: "Tablet SSO Member",
  phoneSsoRoot: "Phone SSO Root",
  phoneWebkitSsoRoot: "Phone WebKit SSO Root",
  tabletSsoRoot: "Tablet SSO Root",
  wrongPassword: "Wrong Password",
  remember: "Remember Me",
  signOut: "Sign Out Tester",
  sidebar: "Sid Sidebar",
  languageChooser: "Language Chooser",
  languageNoJs: "Language No JS",
  languageSwitcher: "Language Switcher",
  languageSaved: "Language Saved",
  languages: "Languages",
  browseLanguages: "Browse Languages",
  restLanguages: "Rest Languages",
  authorLanguages: "Author Languages",
  adminLanguages: "Admin Languages",
  phoneLanguages: "Phone Languages",
  phoneWebkitLanguages: "Phone WebKit Languages",
  tabletLanguages: "Tablet Languages",
  focusModerator: "Fay Focus",
  phoneFocus: "Phoebe Focus",
  phoneWebkitFocus: "Wendy Focus",
  tabletFocus: "Tabitha Focus",
  shelvesAdmin: "Sheldon Shelf",
  shelvesMember: "Shelley Member",
  shelvesVault: "Vera Vault",
  shelvesOutsider: "Otto Outsider",
  shelvesRoot: "Rhea Shelf",
  starterAccount: "Alma Account",
  starterFlow: "Flora Flow",
  starterNoJs: "Nils NoScript",
  phoneStarterFlow: "Phoebe Flow",
  phoneWebkitStarterFlow: "Wendy Flow",
  tabletStarterFlow: "Tabitha Flow",
  phoneStarter: "Phoebe Starter",
  phoneWebkitStarter: "Wendy Starter",
  tabletStarter: "Tabitha Starter",
  favoriter: "Faye Favorite",
  favoriterNoJs: "Nolan NoScript",
  pinsAdmin: "Pia Pinner",
  phonePinsAdmin: "Phoebe Pinner",
  phoneWebkitPinsAdmin: "Wendy Pinner",
  tabletPinsAdmin: "Tabitha Pinner",
  changePassword: "Change Password Tester",
  twoFactor: "Tess Twofactor",
  twoFactorHeld: "Hal Held",
  twoFactorModerator: "Mo Twofactor",
  twoFactorRoot: "Ruth Twofactor",
  twoFactorResettable: "Reese Reset",
  phoneTwoFactor: "Phoebe Twofactor",
  phoneWebkitTwoFactor: "Webb Twofactor",
  tabletTwoFactor: "Tabby Twofactor",
  device: "Dev Ice",
  deviceTwoFactor: "Dev Twofactor",
  phoneDevice: "Phone Dev",
  phoneDeviceTwoFactor: "Phone Dev Twofactor",
  phoneWebkitDevice: "Webkit Dev",
  phoneWebkitDeviceTwoFactor: "Webkit Dev Twofactor",
  tabletDevice: "Tablet Dev",
  tabletDeviceTwoFactor: "Tablet Dev Twofactor",
  homeMember: "Home Member",
  homeCopier: "Home Copier",
  homeCards: "Home Cards",
  catalogueView: "Catalogue View",
  catalogueViewNoJs: "Catalogue View No JS",
  feedbackSender: "Feedback Sender",
  feedbackNoJs: "Feedback No JS",
  feedbackRoot: "Feedback Root",
  feedbackLimit: "Feedback Limit",
  feedbackErasable: "Feedback Erasable",
  phoneFeedback: "Phone Feedback",
  phoneWebkitFeedback: "Phone Webkit Feedback",
  tabletFeedback: "Tablet Feedback",
  mustChange: "Must Change",
  mustChangeTwoFactor: "Must Change Two Factor",
  mustChangeRoot: "Must Change Root",
  mustChangeAsk: "Must Change Ask",
  phoneMustChange: "Phone Must Change",
  phoneWebkitMustChange: "Phone Webkit Must Change",
  tabletMustChange: "Tablet Must Change",
  noticeRoot: "Notice Root",
  noticeMember: "Notice Member",
  phoneNoticeRoot: "Phone Notice Root",
  phoneWebkitNoticeRoot: "Phone WebKit Notice Root",
  tabletNoticeRoot: "Tablet Notice Root",
  notRoot: "Not Root",
  tokens: "Token Tester",
  submitter: "Submitter",
  hookAuthor: "Hook Author",
  moderator: "Mo Moderator",
  releaser: "Rae Releaser",
  erasable: "Erasable Person",
  dataOwner: "Data Owner",
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
  scanRoot: "Sam Root",
  scanAuthor: "Sky Author",
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
  scopeItemMover: "Scope Item Mover",
  scopeItemModerator: "Scope Item Moderator",
  phoneScopeItemMover: "Phone Item Mover",
  phoneScopeItemModerator: "Phone Item Moderator",
  phoneWebkitScopeItemMover: "iOS Item Mover",
  phoneWebkitScopeItemModerator: "iOS Item Moderator",
  tabletScopeItemMover: "Tablet Item Mover",
  tabletScopeItemModerator: "Tablet Item Moderator",
};

/** Seeded with root's request to choose a new password (128): held on the change page at sign-in. */
export const E2E_MUST_CHANGE: readonly (keyof typeof E2E_USERS)[] = [
  "mustChange",
  "mustChangeTwoFactor",
  "phoneMustChange",
  "phoneWebkitMustChange",
  "tabletMustChange",
];

/** Seeded with the moderator role; everyone else is a user. */
export const E2E_MODERATORS: readonly (keyof typeof E2E_USERS)[] = [
  "moderator",
  "languages",
  "authorLanguages",
  "phoneLanguages",
  "phoneWebkitLanguages",
  "tabletLanguages",
  "twoFactorModerator",
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
  "adminLanguages",
  "shelvesRoot",
  "ssoRoot",
  "phoneSsoRoot",
  "phoneWebkitSsoRoot",
  "tabletSsoRoot",
  "privateRoot",
  "twoFactorRoot",
  "scopeMoveRoot",
  "phoneScopeMoveRoot",
  "phoneWebkitScopeMoveRoot",
  "tabletScopeMoveRoot",
  "phoneRoot",
  "phoneWebkitRoot",
  "tabletRoot",
  "noticeRoot",
  "feedbackRoot",
  "mustChangeRoot",
  "phoneNoticeRoot",
  "phoneWebkitNoticeRoot",
  "tabletNoticeRoot",
  "scanRoot",
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
    "shelvesVault",
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

/**
 * Pins (125): a public workspace with a released skill, `@e2e-pins/e2e-pins-tools/pin-notes`, and
 * each project's admin of it, who pins it to the workspace's shelf from the item's page.
 */
export const E2E_PINS = {
  workspace: "e2e-pins",
  scope: "e2e-pins-tools",
  item: "pin-notes",
  admins: {
    chromium: "pinsAdmin",
    phone: "phonePinsAdmin",
    "phone-webkit": "phoneWebkitPinsAdmin",
    tablet: "tabletPinsAdmin",
  },
} as const satisfies {
  workspace: string;
  scope: string;
  item: string;
  admins: Record<string, keyof typeof E2E_USERS>;
};

/**
 * Shelves on a desktop browser (125): a public workspace with a released skill, `shelf-notes`' twin
 * `shelf-item`, its admin, and two members, one of whom is also in the private vault.
 */
export const E2E_SHELVES = {
  workspace: "e2e-shelves",
  scope: "e2e-shelves-tools",
  item: "shelf-item",
  admin: "shelvesAdmin",
  members: ["shelvesMember", "shelvesVault"],
} as const satisfies {
  workspace: string;
  scope: string;
  item: string;
  admin: keyof typeof E2E_USERS;
  members: readonly (keyof typeof E2E_USERS)[];
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

/**
 * What the erasable user (103) leaves behind: a rule they published in the seeded scope, and a
 * submission of the releaser's (a fixed id, so the test can open its review) they commented on.
 */
export const E2E_ERASE = {
  item: "erase-rule",
  submission: "erase-review",
  submissionId: "01K6E2EERASEREVW0000000001",
  comment: "Looks good from here.",
};

/** What the data owner (104) published, and the comment they left on the erasable review. */
export const E2E_DATA = {
  item: "data-rule",
  comment: "My own words on this review.",
};

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

/**
 * Moving an item to another scope (134): per project, a workspace with two scopes, `infra` with
 * the item and `devops`, its member who asks and its moderator who answers.
 */
export const E2E_ITEM_MOVE = {
  from: "infra",
  to: "devops",
  item: "deploy",
  projects: {
    chromium: { member: "scopeItemMover", moderator: "scopeItemModerator" },
    phone: { member: "phoneScopeItemMover", moderator: "phoneScopeItemModerator" },
    "phone-webkit": {
      member: "phoneWebkitScopeItemMover",
      moderator: "phoneWebkitScopeItemModerator",
    },
    tablet: { member: "tabletScopeItemMover", moderator: "tabletScopeItemModerator" },
  } as const satisfies Record<
    string,
    { member: keyof typeof E2E_USERS; moderator: keyof typeof E2E_USERS }
  >,
  workspace: (project: string) => `e2e-item-move-${project}`,
};
