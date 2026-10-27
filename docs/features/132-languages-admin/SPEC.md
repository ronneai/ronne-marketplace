# 132 — Languages: admin and setup

> Milestone: M19 · Depends on: 129, 130 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) · Contracts: none changed (the web app only; the API, `rmk` and MCP stay in English)

## Goal

The screens root and the people who run an instance use speak the person's language: Admin
(Users and a user's page, Scopes and Workspaces, the Audit log, Settings with all its tabs, the
identity provider and SCIM screens), the setup wizard and the CLI sign-in panel.
129 built the machinery, 130 and 131 moved browse and author; 124–128 already wrote Home, Notice,
Feedback and the password change with messages. This feature moves what is left, in Portuguese and
French beside English, and the last `Help` entries with them. Nothing about what the screens do
changes.

## Scope

**In:**
- **Admin shell and Users** (`app/(app)/admin/layout.tsx`, `admin/page.tsx`, `features/admin-users`):
  the users table and its filters, create user (the password choice and the one-time password),
  a user's page and its actions (reset or require a password change, reset two-factor, disable,
  erase, download their data, the workspaces dialog, copy email), page titles.
- **Scopes and Workspaces** (`features/admin-scopes`, `features/admin-workspaces`): the scopes
  table and its dialogs, the workspaces table, move a scope. The scopes table on a workspace's
  page speaks English until now (130 left it); it moves here, and 130's e2e allowance
  `UNTIL_132` goes.
- **The Audit log** (`features/admin-audit`, `app/(app)/admin/audit`): the table, filters, event
  dialog and details, and **`summary.ts`**: its ~575 lines of English sentences ("signed in via
  SSO", "moved @scope to…") become messages with plurals, one per event type, with the names
  inside them shown as data. The stored events are unchanged; only how they read.
- **Settings** (`features/admin-settings`, `app/(app)/admin/settings`): the tab names and every
  tab's forms and notices: Authentication (sign-in methods, password policy, two-factor policy,
  the identity providers and SCIM section), Usage (policy and minimum), Plugin feeds, Privacy
  (retention, last run, pending erasures). The Notice tab is done (124) and only joins the scan.
- **Setup** (`features/setup`, `app/setup`): the wizard's steps, fields, hints, the
  "database unavailable" panel and its validation messages. The wizard runs before there is a
  user or a database, so the language is the cookie or the browser's (129), and the 129
  language links stay.
- **Small pieces** (`components/cli-auth`: the CLI sign-in panel, whose words moved in 129; it joins
  the scan here).
- **What the actions say.** The success lines and errors of the action files above, as codes or
  `errorText` (129). `errors.json` gets the classes these screens can raise from the identity
  (39), settings (9), usage (3), audit (4) and workspaces (32) domains that are not there yet,
  in all three languages, with their lists and plurals; an error built from English pieces
  carries them as codes (as 131 did), its English message unchanged for the API. The setup
  wizard's own checks (`form.ts`, `install.ts`) say their words from codes.
- **Inline helpers.** The 32 `Help` entries still in `Help.tsx` move to `help.json`:
  `rename-workspace`, `global-always`, `move-who`, `visibility`, `token`, `scim-provider`,
  `scim-managed`, `device-code`, `plugin-feeds`, `usage-minimum`, `auth-methods`,
  `provider-values`, `redirect-uri`, `provider-groups`, `password-lockout`, `backup-codes-once`,
  `lost-phone`, `two-factor-policy`, `reset-two-factor`, `retention`, `erase-user`, `notice`,
  `notice-tone`, `language`, `your-data`, `download-user-data`, `usage-policy`, `role-root`,
  `own-row`, `audit-summary`, `audit-incident`, `audit-actor`. After this `HELP` holds no text.
- **Guards.** The folders above join the raw-text scan (`biome.json` overrides); their routes
  (`/admin`, `/admin/users`, `/admin/users/[id]`, `/admin/audit`, `/admin/settings`, `/setup`)
  join `MIGRATED_ROUTES` (or already are, for Settings and Feedback, whose comment says "132");
  a component test per area in three languages with the English-leak guard; a test per new
  error class.

**Out** (and where it goes instead):
- **The styleguide** (`features/styleguide`): a design reference for developers, open to anyone in
  development and to root in production (032), whose demo text describes the design system. It
  stays English and out of the scan (decision of this feature, to be confirmed by the owner).
- **What other people wrote or configured**: a provider's name and values, a scope's or
  workspace's name and description, the notice text root writes, a user's name, an audit
  event's stored details. Shown as stored.
- **The messages `@ronneai/core` writes** stay English (131's decision).
- **What the identity domain writes** stays English, like core's: an OIDC preset's setup steps,
  piece labels and examples, the checks and the decision a *Test sign-in* or *Test connection*
  returns, and the field errors of the provider form.
  The setup wizard likewise shows as written the database check's explanation, a driver's own
  message, the settings-file merge error and the database-ahead error (they come from `server/`),
  and the root account's email, name and password messages (the identity domain's). The frame around them is translated; 133 can
  revisit it with the native reviewers.
- **The email or other notifications** (out of the MVP).
- **An instance default language**, unless the owner wants it (Open questions).
- **The sign-off**: the whole-app raw-text scan, the native-speaker review, the phone sweep in
  each language and the Documentation links check: 133.

## Behaviour

- **Audit sentences are messages, not joined pieces.** Each event type has one ICU message with
  its names as placeholders (`{actor}`, `{scope}`); the names stay data and link where they did
  (`SummaryPart`). Where a sentence had optional parts (via SSO, a reason, a policy), the message
  takes a `select` on a code, never fragments joined in code. The exception is what code puts between translated
  pieces and around recorded data: the space, brackets and commas of the short list some sentences
  end with ("(2 sessions ended, 1 token revoked)", or "(nothing left)" alone, a moved scope's counts, a draft's type and files,
  a deleted workspace's members and move requests) and of the changes of the retention, of the
  notice and of a provider update; the language's "and" between the fields a SCIM user update
  changed; the space that opens "from the command line" and the like; and the identifiers and
  dates written the same in every language: `@scope`, `name@version`, the `YYYY-MM-DD` of a token's
  expiry and the `YYYY-MM-DD HH:MM` of a restored backup's time. Each item of a list is itself a
  message with its plural.
- **An unknown audit event type** (a new one from a later feature, or a stored one with no
  message) shows its type code and its target type, `user.archived (user)`, as it did; never blank.
- **The setup wizard** works with no database and no user: its messages load from files only,
  and a person with no cookie gets the browser's language, then English.
- **Errors.** A known error shows its translation; an error with no translation shows the
  English message. The API's messages are unchanged.
- **Lists of names and counts** follow each language's list format and plural rules, as in 130
  and 131.

## Edge cases

- The wizard's long Portuguese and French hints and the audit table's sentences must not break
  the layout on a phone: the sweep runs these pages in each language.
- A name, scope, email or provider value inside a translated sentence is data, shown as typed
  even if it looks like a placeholder (`{x}`).
- Counts of 0, 1 and 2 follow each language's plural rule (tests check all three), including the
  audit sentences that count things (items released together, users erased).
- Timestamps keep the numeric form in every language (049).
- Root's own row, a disabled user and a user who signs in by SSO each read correctly in a
  translated sentence (the "(you)" and "managed by SSO" marks are messages).
- A deep link to a user, an audit event or a settings tab keeps working in every language; no
  URL changes.

## Documentation

- **ronne-web** (`www/src/content/docs/`): the Portuguese and French pages for Admin, Users,
  Scopes and Workspaces, the Audit log, Settings (each tab), Setup and Identity providers take
  the names of the labels they mention from the message files; English changes only where it
  named a label unlike the app. No new topic or section, so neither `topics.ts` changes; the
  translation guide takes the glossary's new words. A ronne-web branch `feat/132-languages-admin`
  goes live with the release.
- **Helpers:** the 32 entries above are now in three languages; no new helper.
- `docs/knowledge/i18n.md`: the glossary gains the words these screens add (user, disable,
  erase, scope, audit log, retention, identity provider, two-factor, backup code, lockout);
  the Help section says the `HELP` table is gone.

## Acceptance criteria

- [x] Admin (Users, a user's page, Scopes, Workspaces, Audit log, every Settings tab), the setup
      wizard and the CLI sign-in panel render in English, Portuguese and French
      with no English text left over (core's messages and stored data aside), on desktop and on a
      phone.
- [x] Every audit event type reads as a translated sentence; an unknown type shows its code.
- [x] The raw-text scan covers every folder listed in Scope and passes; the phone sweep runs the
      routes in Portuguese and French; 130's `UNTIL_132` allowance is gone.
- [x] Every action in scope returns a code or a translated message; each error class added has
      a text in all three languages (a test for each, with 0/1/2 counts and lists where they
      have them); the API's messages are unchanged.
- [x] The 32 helpers read in the person's language and their links open the website's page in it;
      `Help.tsx` holds no text.
- [x] The setup wizard shows in the browser's language with no database and no user.
- [x] The key-parity and placeholder tests pass.
- [x] The Portuguese and French Documentation pages name these screens' labels as the app does.

## Decisions

- **Follows 130 and 131**: the actions say their own words (success lines from
  `getTranslations`, errors from `errorText`); the helpers move by area; core's messages stay
  English; the glossary's words are used as they are.
- **SSO and SCIM screens are the ones that exist today** (the identity provider panel and
  SCIM section under Settings › Authentication). M16 features built later write their screens
  with messages from the start (129).

## Open questions

- **An instance default language.** 129 left it "if wanted": root sets the language that people
  with no choice, and the sign-in and setup pages, start in (today: the browser's, then English).
  **Not built in this feature** (recommendation: leave it out; it adds a setting, tests and a
  Documentation topic, and nobody has asked). It can be its own feature if the owner wants it.
- **The styleguide stays English** (see Out). The owner confirms or asks for it to move.
