# 133 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.
Follow [`docs/knowledge/i18n.md`](../../knowledge/i18n.md).

## Tasks

- [x] **1. Inventory.** List every file under `apps/web/src` the `biome.json` overrides do not
  reach (`app/layout.tsx`, `app/language`, `app/(app)/current-workspace`, the workspace item
  routes, anything added since 132), with a line each: text to move, or nothing to move. Write it
  in `INVENTORY.md` in this folder.
  *Done when:* the inventory is complete: a script lists the uncovered files and the document
  accounts for every one.

- [x] **2. The rule over the whole app.** Replace the folder list with `apps/web/src/**` minus
  `server/**`, `app/api/**`, `features/styleguide/**`, `app/(app)/styleguide/**` and test files;
  move the text the inventory found into messages (three languages) or give it a
  `biome-ignore lint/plugin: <why>`.
  *Done when:* `pnpm lint` passes; a fixture proves a new file in a new folder fails; the
  parity test passes.

- [x] **3. Fragment check.** A test that lists pt and fr messages containing a run of English
  function words, with the key and the words, failing unless on `english-fragments.allow.json`
  (a reason per entry). Run it, and settle each hit: fix the message or allow it with a reason.
  *Done when:* the test passes with a reviewed allowlist; planting "the" in a pt message fails
  it; a plain Portuguese or French word that looks English ("a", "on", "me", "pour") does not.

- [x] **4. One e2e English scan.** Move `noEnglish` into a shared helper (newlines and tabs);
  use it in every language spec (browse, author, admin, wizard, account, home, feedback,
  sign-in).
  *Done when:* each spec uses the helper; planting English in a table cell fails the specs for
  Catalogue, Reviews and Users; the e2e project runs green.
  *Note:* "every language spec" means the specs that scan a whole page for English: browse, author,
  admin, the wizard and the new `languages-rest.e2e.ts` (Home, the Account pages, Feedback, the
  phone menu, the device page, sign-in). `languages.e2e.ts` (the 404 page, the sidebar, choosing a
  language, the sign-in links) makes targeted assertions and `languages.mobile` / `mobile-sweep`
  check layout; none scans a whole page, so they stay as they are. The scan now reads every
  message file, which made three messages whose English is also data (an item's `name`, a seeded
  keyword, the `global` workspace's description) exceptions in the browse spec.

- [x] **5. Phone sweep in every language.** Remove `MIGRATED_ROUTES`; every page runs in en, pt
  and fr, signed in and out; `pages-coverage.test.ts` says every page file is in the sweep or on
  an exceptions list with a reason.
  *Done when:* the sweep passes on phone, phone-webkit and tablet; a page file added without
  being in the sweep fails the coverage test.
  *Note:* `/setup` is skipped by the sweep in every language (it needs an instance that is not set
  up), so the old pt/fr list never swept it on a phone either; `setup-wizard-languages.e2e.ts` now
  checks each step of the wizard for sideways overflow at 320px, in Portuguese and French. The
  mentions of `MIGRATED_ROUTES` left in feature 132's records are history.

- [ ] **6. Documentation links.** A test (and a script, `pnpm docs:links`) that checks every
  `Help` link and every Documentation link in the app against ronne-web's `topics.ts` and pages,
  in the three languages, when `../ronne-web` is present; the release runbook gets the step for
  the deployed site.
  *Done when:* the test passes with the sibling present and says why it skipped without it;
  renaming a section in ronne-web fails it.

- [ ] **7. Website wording.** In ronne-web (a branch `feat/133-languages-signoff`): the two
  rules in the translation guide; every pt and fr page follows them; the Overview tab, Status
  column and Cancel button named as the app does; a read of the French for the Canadian register.
  *Done when:* a grep over `pt/` and `fr/` finds no « revue », « proposition de changement » or
  "proposta de mudança" outside a quoted foreign label; ronne-web lint, typecheck, test and build
  pass.

- [ ] **8. Decisions with the owner.** Ask: the styleguide, the instance default language, the
  server-written text, and who the two readers are. Record each answer in this SPEC and in the
  decision log; if the owner wants something built, add its task here or open its own feature.
  *Done when:* the SPEC's Open questions are answered and the decision log (MVP §15) has the lines.

- [ ] **9. The review kit.** `pnpm i18n:review` writes, from the message files, one readable
  file per namespace (key, screen, English, Portuguese, French) under `docs/features/133-…/review/`
  (git-ignored) and a short guide for the reviewers (what to look at, the glossary, how to send
  corrections). Add the website's pages as the second part of the guide.
  *Done when:* running it twice gives the same files; a changed message shows in the export; the
  guide lists the glossary's rules.

- [ ] **10. The native review, applied.** The two readers go through the kit and the website; each
  correction is made in the message files (or ronne-web), the glossary and the guides updated
  where a rule is behind it, and each finding recorded in `REVIEW.md` (who, what, done or
  answered).
  *Done when:* every finding in `REVIEW.md` is closed; the parity, placeholder, untranslated and
  fragment tests pass; the e2e project is green. *The witness can check the record and the tests,
  not that the reading was done well: that verdict is "can't check here".*

- [ ] **11. Documentation and records.** `docs/knowledge/i18n.md` (whole-app rule, fragment check,
  review kit), the release runbook, the index row set to `done`, this PLAN's "Done" notes, and
  the ronne-web branch's translation guide.
  *Done when:* `pnpm witness:check` passes; the ronne-web branch builds.
