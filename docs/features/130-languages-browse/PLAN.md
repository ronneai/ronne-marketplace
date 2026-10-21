# 130 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.
Every task that moves a folder adds it to the `overrides` entry in `biome.json` and follows
[`docs/knowledge/i18n.md`](../../knowledge/i18n.md).

## Tasks

- [ ] **1. Shared words.** The item types (`TYPE_INFO` labels' descriptions and groups), roles (one
  set of messages replacing the three `ROLE_LABELS`), status badges, `TypeBadge`, `ItemCard`, the
  data-table footer's noun and pager (a plural per language), and number and date formatting by
  language (a small helper, no `en-US`/`en-GB` in scope). Namespaces `types`, `roles` (or in
  `common`) as the glossary suggests; glossary rows for the new words.
  *Done when:* component tests render `TypeBadge`, `ItemCard` and the table footer in three
  languages with counts 0, 1 and 2; the parity test passes.

- [ ] **2. Catalogue.** `CatalogueView` (sort options with hints, filters and their chips, the
  empty states with `<mono>rmk</mono>`, the pager, "all {total}", "Personal ({workspace})"), the
  page title.
  *Done when:* a three-language test with the English-leak guard; the folder is in the scan; the
  route is in `MIGRATED_ROUTES`.

- [ ] **3. Item page: header, tabs, Tools and Propose.** `ItemPageView` (the meta line, the version
  notice as whole sentences), `tabs.ts` and `ItemTabs` (risk count), `ToolsPanel`, `ProposeButton`,
  `load.ts`, and the item routes' titles (`items/[scope]/[name]`, versions, workspace item
  routes).
  *Done when:* a three-language test per component; the version notice's four variants are tested
  in each language; the routes are in `MIGRATED_ROUTES`.

- [ ] **4. Item page: Overview.** `OverviewTab`, `overview/model.ts` (the per-type rows and
  sentences), `UsageCard` (plurals, the list of silent tools, dates, numbers), `CopyChip`,
  `DependencyGraph`.
  *Done when:* the model and usage-card tests run in three languages; no `en-US`/`en-GB` left in
  the folder; the chart's bar `title`s are messages.

- [ ] **5. Workspaces: list, join and the current-workspace line.** `WorkspacesPage`,
  `RequestControls`, `JoinPage`, `Showing` (the three variants), the pages under
  `app/(app)/workspaces` that are not the members and requests tabs.
  *Done when:* three-language tests; dates inside sentences read in the language's word order.

- [ ] **6. Workspaces: members, requests and moves.** `MembersTable`, `MemberControls`,
  `RequestsTable`, `AnswerControls`, `ScopeMovesTable` (aria-labels as messages, the impact list),
  the workspace page's tabs.
  *Done when:* three-language tests; the shared table footer noun is correct for 0, 1 and 2.

- [ ] **7. What the actions say.** [risky] The success lines and errors of the four action files in
  scope as codes or `errorText`; `errors.json` gets the workspaces domain's classes (about 30) and
  the identity and submissions errors these screens can raise, in all three languages, with the
  lists and plurals of `WorkspaceHasOutsideDependentsError` and `WorkspaceRenameAliasError`.
  *Done when:* a test per class in three languages (`errors.test.ts`); an action test that an
  unknown error still shows the English message; the API's messages are unchanged (a test).

- [ ] **8. The inline helpers.** The `Help` mechanism reads migrated entries from `help.json` by
  id; the fourteen entries move, in three languages; the rest stay.
  *Done when:* `help.test.tsx` renders a migrated and an unmigrated entry; a parity test covers
  `help.json`; each moved helper's link opens the website's page in the language.

- [ ] **9. End to end.** `MIGRATED_ROUTES` and the pinned list gain the browse routes; an
  end-to-end test that opens the Catalogue, an item and a workspace in Portuguese and in French and
  sees no English left; the phone sweep passes in each language.
  *Done when:* the e2e project runs green (chromium and phone) on a fresh build.

- [ ] **10. Documentation and records.** The Portuguese and French pages in ronne-web name the
  labels as the app does (a branch there); the glossary; the index row; the PLAN's "Done" notes.
  *Done when:* `pnpm witness:check` passes; the ronne-web branch builds.
