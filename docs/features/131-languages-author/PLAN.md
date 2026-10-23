# 131 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.
Every task that moves a folder adds it to the `overrides` entry in `biome.json` and follows
[`docs/knowledge/i18n.md`](../../knowledge/i18n.md).

## Tasks

- [ ] **1. Shared words.** The statuses (`statusLabel` becomes a set of messages, used by
  `StatusBadge`, the filters and sentences), `ProposalBadges`, `DependencyMarks`, a new `author`
  namespace (its three files and `namespaces.ts`). `components/submissions` joins the scan.
  *Done when:* three-language tests of the badges and marks, with the English-leak guard; the
  parity test passes.

- [ ] **2. Files, code and checks.** `components/files` (the Files tab and viewer),
  `components/code` (the file tree's and editor's labels), `components/validation` (the issues
  popover and list: heading, counts, severities; core's messages shown as they come),
  `components/risk-flags`, `components/tools`, `components/markdown`.
  *Done when:* three-language tests; a test that a core message stays as given inside the
  translated list; the folders are in the scan; `?tab=files` reads in the language.

- [ ] **3. The dependency canvas.** `components/dependency-canvas` (node text, controls, legends)
  and the composer canvas and dependency picker in `features/draft-editor`.
  *Done when:* three-language tests; the Overview's canvas (130) has no English left.

- [ ] **4. The draft editor: form and YAML.** `NewDraftForm`, `ManifestForm` and
  `manifest-fields.ts` (labels, hints, placeholders), the YAML view, `issues.ts`'s notices
  (`AS_OF_SAVE`), `features/manifest-validation`, `app/(app)/submissions/new`.
  *Done when:* three-language tests of the new-draft form and the manifest form with each item
  type's fields; the route is in `MIGRATED_ROUTES`.

- [ ] **5. The draft editor: files, proposals and submit.** `DraftEditor`, `FileDialogs`
  (add, rename, delete, upload, zip import), `ProposalBar`, `SubmitDialogs` and
  `submit-preview.ts` (whole sentences with plurals), `app/(app)/submissions/[id]`.
  *Done when:* three-language tests of each dialog and the submit preview with 0, 1 and 2
  drafts; the route is in `MIGRATED_ROUTES`.

- [ ] **6. My submissions.** `SubmissionsTable`, its filters, `ArchivedActions`, `BulkSubmit`,
  `app/(app)/submissions/page.tsx`.
  *Done when:* three-language tests; the table footer's noun is right for 0, 1 and 2; the route
  is in `MIGRATED_ROUTES`.

- [ ] **7. Reviews: the queue.** `QueueTable`, `QueueStatus`, `BulkApprove`, `list.ts`,
  `app/(app)/reviews/page.tsx`.
  *Done when:* three-language tests; the route is in `MIGRATED_ROUTES`.

- [ ] **8. Reviews: a review's page.** `DecisionBar`, `Conversation`, `CommentForm`,
  `ProposalChanges`, `ReviewFiles`, `PublishDialog`, `release-group.ts`,
  `app/(app)/reviews/[id]`.
  *Done when:* three-language tests of each decision and the publish dialog; the route is in
  `MIGRATED_ROUTES`.

- [ ] **9. Versions and releases.** `VersionsTab`, `VersionControls`, `ChangeDialog` (tag,
  deprecate, yank), `BulkRelease`, the item page's remaining text (`actions.ts`, `tabs.ts`).
  *Done when:* three-language tests; `features/versions`, `features/releases` and the rest of
  `features/item-page` are in the scan.

- [ ] **10. What the actions say.** [risky] The success lines and errors of the action files in
  scope (`draft-editor`, `submissions`, `reviews`, `versions`, `releases`, `item-page`) as codes
  or `errorText`; `errors.json` gets the submissions domain's 44 classes and the six items classes
  the spec lists, in all three languages, with their lists and plurals.
  *Done when:* a test per class in three languages (`errors.test.ts`); an action test that an
  unknown error still shows the English message; the API's messages are unchanged (a test).

- [ ] **11. The inline helpers.** The 27 entries move from `HELP` to `help.json`, in three
  languages.
  *Done when:* `help.test.tsx` and the parity test cover them; each moved helper's link opens the
  website's page in the language.

- [ ] **12. End to end.** `MIGRATED_ROUTES` and the pinned list have the five routes (and the
  Settings comment there says 132, not 131); an end-to-end test that opens a draft, the
  submissions list, a review and an item's Versions tab in Portuguese and in French and sees no
  English left (core's messages and data aside); the phone sweep passes in each language.
  *Done when:* the e2e project runs green (chromium and phone) on a fresh build.

- [ ] **13. Documentation and records.** The Portuguese and French pages in ronne-web name the
  labels as the app does (a branch there); the glossary; the index row; the PLAN's "Done" notes.
  *Done when:* `pnpm witness:check` passes; the ronne-web branch builds.
