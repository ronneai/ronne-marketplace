# 131 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.
Every task that moves a folder adds it to the `overrides` entry in `biome.json` and follows
[`docs/knowledge/i18n.md`](../../knowledge/i18n.md).

## Tasks

- [x] **1. Shared words.** The statuses as messages (`author.status`, used by `StatusBadge`;
  the submissions filters take them in task 6, and the services' sentences that use `statusLabel`
  go with the actions in task 10), `ProposalBadges`, `DependencyMarks`, a new `author` namespace
  (its three files and `namespaces.ts`). `components/submissions` joins the scan.
  *Done when:* three-language tests of the badges and marks, with the English-leak guard; the
  parity test passes.

- [x] **2. Files, code and checks.** `components/files` (the Files tab and viewer),
  `components/code` (the file tree's and editor's labels), `components/validation` (the issues
  popover and list: heading, counts, severities; core's messages shown as they come),
  `components/risk-flags`, `components/tools`, `components/markdown`.
  *Done when:* three-language tests; a test that a core message stays as given inside the
  translated list; the folders are in the scan; `?tab=files` reads in the language.

- [x] **3. The dependency canvas.** `components/dependency-canvas` (node text, controls, legends)
  and the composer canvas and dependency picker in `features/draft-editor`.
  *Done when:* three-language tests; the Overview's canvas (130) has no English left.

- [x] **4. The draft editor: form and YAML.** `NewDraftForm`, `ManifestForm` and
  `manifest-fields.ts` (labels, hints, placeholders), the type picker's tags (`TYPE_INFO.tag`,
  shown and searched in `NewDraftForm`), the YAML view, `issues.ts`'s notices
  (`AS_OF_SAVE`), `features/manifest-validation`, `app/(app)/submissions/new`.
  *Done when:* three-language tests of the new-draft form and the manifest form with each item
  type's fields; the route is in `MIGRATED_ROUTES`.

- [x] **5. The draft editor: files, proposals and submit.** `DraftEditor`, `FileDialogs`
  (add, rename, delete, upload, zip import), `ProposalBar`, `SubmitDialogs` and
  `submit-preview.ts` (whole sentences with plurals), `app/(app)/submissions/[id]`.
  *Done when:* three-language tests of each dialog and the submit preview with 0, 1 and 2
  drafts; the route is in `MIGRATED_ROUTES`.

- [x] **6. My submissions.** `SubmissionsTable`, its filters, `ArchivedActions`, `BulkSubmit`,
  `app/(app)/submissions/page.tsx`.
  *Done when:* three-language tests; the table footer's noun is right for 0, 1 and 2; the route
  is in `MIGRATED_ROUTES`.

- [x] **7. Reviews: the queue.** `QueueTable`, `QueueStatus`, `BulkApprove`, `list.ts`,
  `app/(app)/reviews/page.tsx`.
  *Done when:* three-language tests; the route is in `MIGRATED_ROUTES`.

- [x] **8. Reviews: a review's page.** `DecisionBar`, `Conversation`, `CommentForm`,
  `ProposalChanges`, `ReviewFiles`, `PublishDialog`, `release-group.ts`,
  `app/(app)/reviews/[id]`.
  *Done when:* three-language tests of each decision and the publish dialog; the route is in
  `MIGRATED_ROUTES`.

- [x] **9. Versions and releases.** `VersionsTab`, `VersionControls`, `ChangeDialog` (tag,
  deprecate, yank), `BulkRelease`, the item page's remaining text (`actions.ts`, `tabs.ts`).
  *Done when:* three-language tests; `features/versions`, `features/releases` and the rest of
  `features/item-page` are in the scan.

- [x] **10. What the actions say.** [risky] The success lines and errors of the action files in
  scope (`draft-editor`, `submissions`, `reviews`, `versions`, `releases`, `item-page`) as codes
  or `errorText`; `errors.json` gets the submissions domain's classes (48; `ReleasePackError` stays English) and the six items classes
  the spec lists, in all three languages, with their lists and plurals.
  *Done when:* a test per class in three languages (`errors.test.ts`); an action test that an
  unknown error still shows the English message; the API's messages are unchanged (a test).

- [x] **11. The inline helpers.** The 27 entries move from `HELP` to `help.json`, in three
  languages.
  *Done when:* `help.test.tsx` and the parity test cover them; each moved helper's link opens the
  website's page in the language.

- [x] **12. End to end.** `MIGRATED_ROUTES` and the pinned list have the five routes (and the
  Settings comment there says 132, not 131); an end-to-end test that opens a draft, the
  submissions list, a review and an item's Versions tab in Portuguese and in French and sees no
  English left (core's messages and data aside); the phone sweep passes in each language.
  *Done when:* the e2e project runs green (chromium and phone) on a fresh build.

- [x] **13. Documentation and records.** The Portuguese and French pages in ronne-web name the
  labels as the app does (a branch there); the glossary; the index row; the PLAN's "Done" notes.
  *Done when:* `pnpm witness:check` passes; the ronne-web branch builds.

### Done (2026-10-23)

All thirteen tasks are ticked, each with its witness passes in `WITNESS.md` (tasks 4, 5, 8 and 9
took a third round, with the owner's approval). The Documentation is on the ronne-web branch
`feat/131-languages-author` (commits 287f55e, d899d89, d96e15f, 53a03e8, fea5c25, cfabd17, 2f42df9, 3f2095a, 6a4bec7, 892ace4, 1164ba2), not pushed: it goes live with the release,
as the owner's rule says. Accepted limits:

- The pt and fr texts are first drafts for a native reader in 133, who also decides whether
  withdraw and yank keep sharing "retirar" / "retirer" (Decisions).
- Core's messages stay English inside translated pages (owner's decision): `ManifestIssue`
  messages, risk flags, renderers' warnings, the registry checks, and `ReleasePackError`, which
  carries core's packing message.
- React Flow's first server markup is English until its labels are applied in the browser
  (Behaviour).
- `InvalidStatusTransitionError`'s English changed for reject, request changes and override (a fix
  of "rejectd", "request changesd", "overrided"); the API says the new words too.
- **Follow-up for 133** (owner, 2026-10-23, moved out of task 13): two prose choices on the
  website differ from the app's labels, for 133's native reader to settle across every page: French prose says « revue » for a review (the app and the glossary say
  « révision »), and pt/fr prose says "proposta de mudança" / « proposition de changement » (the app
  says "proposta de alteração" / « proposition de modification »). Labels the pages quote are the
  app's. *Done when:* ronne-web's translation guide has one rule for each, and every pt and fr page
  follows it.
- The phone sweep's allowance for `/submissions/new` (072) is from before this feature and stays.

