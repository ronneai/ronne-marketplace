# 129 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Inventory and dependency check.** List the user-facing text by area (components,
  server-action results, error classes with variable parts) into the task's notes, and check
  `next-intl` against `docs/policies/dependencies.md` (licence, release age, no install scripts,
  audit) at the version ronne-web uses or newer.
  *Done when:* the notes list the areas and the error codes that need keys; `pnpm licenses:check`
  and `pnpm audit --audit-level high` pass with the package added.

- [x] **2. The saved language.** [risky] Migration `user.locale` (nullable text, one migration for
  all three dialects), the identity repository and model (`Locale`, `isLocale`), a service and
  action `setLocale`, the value on the session user, and "Your data" (104).
  *Done when:* `*.db.test.ts` pass on SQLite and, run once, on PostgreSQL and MySQL; the migration
  guard test passes; the data download contains the value.

- [ ] **3. Choosing the language.** `resolveLocale` (saved → `ronne-locale` cookie →
  `Accept-Language` → `en`), the cookie's flags and validation, the `next-intl` request config
  without URL prefixes, `<html lang>` in the root layout.
  *Done when:* unit tests cover each step, `pt-PT`, `fr-CA`, `es`, quality values, a stale cookie
  and a removed saved value.

- [ ] **4. Message files and the guards.** `apps/web/messages/<locale>/<namespace>.json`, the
  loader that merges them, English fallback with a logged warning, the key-parity and placeholder
  tests, and the raw-text scan with its folder list (empty to start).
  *Done when:* the parity test fails on a key missing in `pt`, the scan fails on a sample file and
  passes on a clean one, and a missing key renders the English text.

- [ ] **5. Shared UI pieces.** `components/ui` text (Copy, Dialog's Close, tables' Sort and paging,
  Notice defaults, empty states), `LocalTime` and number formatting by language, the Help popover's
  frame, the 404 and error pages. English, Portuguese and French files.
  *Done when:* component tests render each piece in the three languages; the scan covers
  `components/ui`.

- [ ] **6. The shell.** Sidebar groups and links, the workspace switcher's labels, the Menu sheet,
  the account menu, counts' accessible names; `nav.ts` holds message keys instead of labels.
  *Done when:* `AppShell` tests pass in the three languages on desktop and phone widths; the scan
  covers `components/app-shell`.

- [ ] **7. Account and the Language select.** Account's pages in messages; Language select with
  Automatic, English, Português, Français; Save sets the saved value and the cookie, with and
  without JavaScript; the user page (123) shows the language read-only.
  *Done when:* component tests, an action test (invalid code refused) and an end-to-end test that
  changes language and sees the sidebar change after Save.

- [ ] **8. Signed-out pages.** Sign-in, device page and the setup wizard's language links (cookie
  only, links without JavaScript); error messages from sign-in in messages (codes kept).
  *Done when:* an end-to-end test switches language on sign-in, signs in without a saved language
  and still sees it; one with a saved language sees that one.

- [ ] **9. Error codes.** The web layer maps known error codes to `errors.<code>` with the English
  text as the fallback; the codes found in task 1 get keys.
  *Done when:* a test per mapped code in three languages, and an unknown code shows the English
  message.

- [ ] **10. Documentation links by language.** `docsUrl` builds the website's address in the
  person's language (task: confirm the website's path pattern for `pt` and `fr`).
  *Done when:* the helper link test passes for the three languages and every link lands on a real
  section.

- [ ] **11. Phone and language sweep.** Run the phone sweep (075) for the migrated pages in
  Portuguese and French (the longest strings), fix overflow.
  *Done when:* the end-to-end sweep passes on every project in the three languages for these pages.

- [ ] **12. Rules and decision log.** `docs/knowledge/i18n.md` (glossary, how to add a message and a
  language), CLAUDE.md ("UI text goes through messages"), MVP §15 row "Languages", the features
  index.
  *Done when:* the files are changed and the knowledge note is linked from CLAUDE.md.

- [ ] **13. Documentation.** The section and helper in the spec, both `topics.ts`, in a ronne-web
  branch.
  *Done when:* the docs tests pass in ronne-web, and the helper link test passes here.

## Notes

Build this before 124–128 so those are written with messages from the start. Translation drafts
may be machine-made; 133 has them read by native speakers.

### Inventory (task 1, 2026-10-21)

**Dependency.** `next-intl` 4.14.9 (MIT; released 2026-10-02; the website uses 4.14.6), added to
`apps/web` as an exact version, with its tree in the lockfile; `pnpm licenses:check` passes (345
packages) and `pnpm audit --audit-level high` finds nothing. Two of them have install scripts,
`@parcel/watcher` and `@swc/core`; both serve next-intl's optional message-extraction features,
which Ronne doesn't turn on, so `allowBuilds` sets them to `false` with the reason (as for
`esbuild`).

**Where the text is.** About 200 non-test `.tsx` files (22,900 lines in `features` and
`components`), English written straight into the JSX. By size: `app` (32 files), `components/ui`
(28), `features/admin-settings` (16), `admin-users` (12), `draft-editor` (9, 3,000 lines), `reviews`
(9), `item-page` (9), `components/app-shell` (8), `account-security` (6), `setup` (5), `sign-in`
(5), `submissions` (4), `account-tokens` (4), `admin-workspaces` (3, 1,200 lines), and about 30
smaller folders.

**How errors reach the screen.** A server action returns `{ error: "<code>" }` and the component
turns the code into English with a constant map, so translating means moving those maps to
messages, not changing the actions. The maps are `const` definitions named `*_ERRORS` or `*_LABELS`
(`grep -rlE "^(export )?const [A-Z_]*(ERRORS|LABELS)\b" features components app`, test files left
out: 17 files, 19 definitions), among them `SIGN_IN_ERRORS`,
`SSO_ERRORS`, `TWO_FACTOR_ERRORS`, `TWO_FACTOR_STEP_ERRORS`, `DEVICE_ERRORS`,
`CHANGE_PASSWORD_ERRORS`, and the `*_LABELS` maps (roles, visibility, tabs, steps, risk flags,
views, chips). The 38 distinct codes in action results: `rate_limited`, `wrong_password`,
`wrong_code`, `invalid_credentials`, `not_signed_in`, `invalid_code`, `invalid_request`, `used`,
`replaced`, `expired`, `invalid_grant`, `already_on`, `user_disabled`, `unavailable`,
`invalid_client`, `two_factor_required`, `password_sign_in_disabled`, `not_enabled`, `mismatch`,
`expired_token`, `authorization_pending`, `another_tab`, `unreadable`, `too_many`, `slow_down`,
`refused`, `provider_error`, `not_found`, `no_password`, `locked`, `just_made`, `access_denied`,
`unsupported_grant_type`, `too_short`, `too_long`, `token_limit`, `signed_out`, `server_error`.
Some are OAuth device-flow codes meant for `rmk` and stay as they are (`authorization_pending`,
`slow_down`, `invalid_grant`, `invalid_client`, `unsupported_grant_type`, `access_denied`,
`expired_token`).

**Domain errors.** 153 error classes (`grep -rhE "^export class \w+ extends" server/domains`) in the eight domains carry English messages made for people
(`MESSAGE_FOR_PEOPLE`), some with variable parts (`"${email}" isn't a valid email address.`,
`The password needs at least ${limit} characters.`). `server/http/errors.ts` turns the ones the API
knows into `{ code, message }`; that stays English. Where the web shows one of these messages
directly, it needs a key built from the class name or `code` plus the variable parts (task 9); where
it shows only a code, the maps above are enough.

**Dates and numbers.** 15 non-test files use `Intl` or `toLocale*`: 10 in the UI (`time-text.ts`,
which `LocalTime` uses, `DataTable`, `ItemCard`, the versions and item-page tabs, the draft editor
and two settings panels: task 5 and the later sweeps) and 5 on the server (the backup commands,
`setup/purge.ts` and the submissions errors), which stay as they are.
