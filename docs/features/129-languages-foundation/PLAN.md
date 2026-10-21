# 129 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Inventory and dependency check.** List the user-facing text by area (components,
  server-action results, error classes with variable parts) into the task's notes, and check
  `next-intl` against `docs/policies/dependencies.md` (licence, release age, no install scripts,
  audit) at the version ronne-web uses or newer.
  *Done when:* the notes list the areas and the error codes that need keys; `pnpm licenses:check`
  and `pnpm audit --audit-level high` pass with the package added.

- [ ] **2. The saved language.** [risky] Migration `user.locale` (nullable text, one migration for
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
