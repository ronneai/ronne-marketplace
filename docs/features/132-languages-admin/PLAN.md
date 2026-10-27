# 132 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.
Every task that moves a folder adds it to the `overrides` entry in `biome.json` and follows
[`docs/knowledge/i18n.md`](../../knowledge/i18n.md).

## Tasks

- [x] **1. Admin shell and namespaces.** The admin layout and overview, page titles through
  `pageTitle`, the admin navigation; the `admin` namespace grows (its three files), and new
  namespaces `setup` and `audit` are registered if the size calls for them (clear the Vitest
  cache, see the i18n note).
  *Done when:* three-language test of the admin shell; the parity test passes.
  *Note:* the layout and `/admin` index hold no text and the sidebar's labels were moved in 129, so
  this task moved the four page titles (`admin/metadata.ts`) and tested the sidebar's Admin links in
  three languages. No new namespace yet: `admin.json` stays small; task 5 or 6 decides on `audit`.

- [x] **2. Users: the list and create.** `UsersPage`, its table and filters, `CreateUserDialog`,
  `PasswordChoice`, `OneTimePassword`, `CopyEmailButton`, `list.ts`.
  *Done when:* three-language tests with 0, 1 and 2 counts; `/admin/users` is in
  `MIGRATED_ROUTES`.
  *Note:* a table with no rows shows its empty state, not a count, so 0 is tested as that state.
  The raw-text rule only reads JSX, so `admin/metadata.ts` (task 1) is covered by its test, not by
  the scan. The phone sweep of `/admin/users` in pt and fr runs in task 13.

- [x] **3. A user's page and its actions.** `UserPage`, `UserPageActions`, `UserActionDialogs`,
  `EraseUserDialog`, `DownloadDataDialog`, `UserWorkspacesDialog`, `WorkspaceRows`.
  *Done when:* three-language tests of each dialog (reset, require change, reset two-factor,
  disable, erase, download); the root's own row and an SSO user read right; `/admin/users/[id]`
  is in `MIGRATED_ROUTES`.
  *Note:* the success lines and errors the user actions return (`state.done`, `state.error`, the
  disable-impact error) stay English until task 11; the Help entries until task 12.

- [x] **4. Scopes and workspaces.** `admin-scopes` (table, dialogs), `admin-workspaces` (table,
  dialogs, `MoveScope`), and the scopes table on a workspace's page.
  *Done when:* three-language tests; `UNTIL_132` is removed from `e2e/languages-browse.e2e.ts`
  and the e2e still passes.
  *Note:* three small English changes: curly apostrophes, counts grouped by the language
  ("Personal (1,000+)"), and a stray "(114)" dropped from the not-reviewed sentence. The
  load-failed messages are codes the forms word, so an effect never depends on a translator.

- [x] **5. The Audit log: the table.** `AuditLogPage`, filters, `EventDialog`, `EventDetails`,
  `format.ts`, `list.ts`, `app/(app)/admin/audit`.
  *Done when:* three-language tests; `/admin/audit` is in `MIGRATED_ROUTES`.
  *Note:* the event sentences (`summary.ts`) are task 6. A new test, `src/i18n/admin-untranslated.test.ts`,
  fails when any pt or fr `admin` message equals its English one (a SAME table lists the words that
  really are the same); it covers the tasks that follow.

- [x] **6. The Audit log: the sentences.** `summary.ts` as ICU messages, one per event type, with
  names as data and `select` for the optional parts (via, reason, policy, SCIM refusal).
  *Done when:* a test that every event type the server writes has a message in all three
  languages (the list comes from the audit domain, so a new type fails the test); 0/1/2 counts;
  an unknown type shows its code; the English text is word for word what it was (a snapshot).
  *Note:* the snapshot is `english-sentences.fixture.json`, the output of the old code for every
  action; the two deliberate English changes are curly apostrophes and numbers grouped by the
  language ("1,284 rows"). Names and codes travel through the message as marked text and come back
  as `SummaryPart`s. The pt and fr wording is first-draft, for 133's native review.

- [x] **7. Settings: the tabs and Authentication.** The tab names (`tabs.ts`), the sign-in
  methods panel, password policy, two-factor policy, `IdentityProvidersPanel`, `ProviderForm`,
  `ProviderPage`, `ProviderControls`, `ScimSection`.
  *Done when:* three-language tests of each form and notice; provider values shown as stored;
  `/admin/settings` reads fully in the language except the tabs of task 8.
  *Note:* what the identity domain writes (a preset's steps and labels, the checks a test returns, the
  field errors) stays English, like core's (SPEC, Out). `signInMethods` takes a translator; the SCIM
  steps are messages; the generic `admin-untranslated` test is the guard for short pt/fr words.

- [x] **8. Settings: Usage, Plugin feeds, Privacy, Notice.** `UsagePolicyForm`,
  `UsageMinimumForm`, `PluginFeedsPanel`, `PrivacyTab`, `RetentionForm`, `LastRun`,
  `PendingErasures`; the Notice tab joins the scan.
  *Done when:* three-language tests; all of `features/admin-settings` is in the scan; the
  Settings comment in `e2e/pages.ts` no longer says "the rest follow in 132".
  *Note:* small English changes: the purge's counts use plurals ("1 IP address"), the retention unit
  follows the number, and sizes and counts are written by the language ("4,6 MiB" in pt).

- [ ] **9. The setup wizard.** `SetupPage`, `SetupForm`, `StepList`, `fields.tsx`,
  `DatabaseUnavailable`, `form.ts` and `install.ts` messages as codes, `app/setup`.
  *Done when:* three-language tests of each step and each validation message; a test that the
  wizard renders with no database and no user; `/setup` reads in the browser's language; it is
  in `MIGRATED_ROUTES`.

- [ ] **10. Small pieces.** `components/cli-auth` (panel, `commands.ts` text around the
  commands, which stay as typed), `features/styleguide`.
  *Done when:* three-language tests; both folders are in the scan.

- [ ] **11. What the actions say.** [risky] The success lines and errors of every action file
  in scope; `errors.json` gets the identity, settings, usage, audit and workspaces classes these
  screens can raise that it lacks, in all three languages, with lists and plurals.
  *Done when:* a test per class in three languages (`errors.test.ts`); an action test that an
  unknown error still shows the English message; the API's messages are unchanged (a test).

- [ ] **12. The inline helpers.** The 32 entries move from `HELP` to `help.json`, in three
  languages; `Help.tsx` keeps no text.
  *Done when:* `help.test.tsx` and the parity test cover them; each moved helper's link opens
  the website's page in the language.

- [ ] **13. End to end.** An end-to-end test that opens Users, a user's page, Audit log,
  Settings (each tab) and Scopes in Portuguese and French and sees no English left (core's
  messages and data aside), and the wizard on a fresh instance in the browser's language; the
  phone sweep passes in each language.
  *Done when:* the e2e project runs green (chromium and phone) on a fresh build.

- [ ] **14. Documentation and records.** The Portuguese and French pages in ronne-web name the
  labels as the app does (branch `feat/132-languages-admin`); the glossary; the index row set
  to `done`; the PLAN's "Done" notes; whichever decision the owner takes on the default language.
  *Done when:* `pnpm witness:check` passes; the ronne-web branch builds.
