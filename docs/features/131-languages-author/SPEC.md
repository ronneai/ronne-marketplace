# 131 — Languages: author and review

> Milestone: M19 · Depends on: 129, 130 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) · Contracts: none changed (the web app only; the API, `rmk` and MCP stay in English)

## Goal

The screens people use to **write, review and release** items speak the person's language: Propose
item and the draft editor (form, YAML, files, the dependency canvas), My submissions, Reviews and a
review's page, the item page's Files and Versions tabs, and the bulk submit, approve and release
dialogs. 129 built the machinery and 130 the browse screens; this feature moves these screens over,
in Portuguese and French beside English. Nothing about what the screens do changes.

## Scope

**In:**
- **Shared pieces** (`components/submissions`, `components/files`, `components/code`,
  `components/validation`, `components/risk-flags`, `components/tools`, `components/markdown`,
  `components/dependency-canvas`): the status badges (`statusLabel` becomes messages; 130 left them
  here), the proposal badges, the dependency marks, the Files tab and file viewer, the file tree
  and code editor's labels, the issues popover and list (their labels and counts), the risk summary
  (its labels), the dependency canvas's node text and controls.
- **Propose item and the draft editor** (`features/draft-editor`, `app/(app)/submissions/new`,
  `app/(app)/submissions/[id]`, `features/manifest-validation`): the new-draft form, the manifest
  form (field labels, hints, placeholders, `manifest-fields.ts`), the YAML view, the file dialogs
  (add, rename, delete, upload, zip import), the proposal bar, the submit dialogs and their preview
  (`submit-preview.ts`), the composer canvas and the dependency picker, "As of your last save" and
  the other editor notices.
- **My submissions** (`features/submissions`, `app/(app)/submissions/page.tsx`): the table, its
  filters, the archived actions, bulk submit.
- **Reviews** (`features/reviews`, `app/(app)/reviews/**`): the queue (table, status, filters),
  bulk approve, a review's page (decision bar, conversation and comment form, proposal changes,
  the review's files, the publish dialog, release groups).
- **Versions and releases** (`features/versions`, `features/releases`, the item page's `actions.ts`
  and `tabs.ts` where they still hold text): the Versions tab, its change dialog (tag, deprecate,
  yank), bulk release.
- **What the actions say.** The success lines and errors of the action files above, as codes or
  `errorText` (129). `errors.json` gets the submissions domain's classes (all but the base class
  and `ReleasePackError`, which carries core's packing message and stays English like core's
  others) and the items domain's that these screens can raise (`ItemNotFoundError`,
  `VersionNotFoundError`, `TagRuleError`, `VersionMessageError`, `VersionDependsOnPrivateError`,
  `ArtifactUnavailableError`), in all three languages, with their lists and plurals. An error
  whose sentence was built from English pieces carries them as codes instead (a path problem, a
  .zip refusal, a tag rule, what needs a message), and its English message stays word for word,
  which is what the API and `rmk` show. One exception, a fix: `InvalidStatusTransitionError`
  read "can't be rejectd", "request changesd" and "overrided"; it now says "rejected", "sent
  back for changes" and "approved as an override", in the API too.
- **Why it can't go.** The reasons the services give for a submission that can't be approved,
  decided on, sent back or released (the queue's checkbox, the disabled decisions, the
  dependents, bulk approve, the Release button and bulk release) carry a code, `why`, beside the
  English `reason`; the screens word the code. A domain error inside one is worded on the server
  before it reaches the browser. None of these reaches the API. The Release button's refusal and
  Submit selected's "not a member" line are worded the same way.
- **Inline helpers.** The 27 `Help` entries these screens show move to `help.json`: `scope`,
  `item-name`, `name`, `type`, `manifest`, `canvas`, `submit-together`, `submit-many`, `risk`,
  `decisions`, `bump`, `tag`, `deprecate-yank`, `export`, `approve-many`, `withdraw`, `archived`,
  `queue-decisions`, `add-dependency`, `version-range`, `which-bump`, `release-many`, `waits-on`,
  `dependents-listed`, `ready`, `personal-review`, `after-submit`.
- **Guards.** The folders above join the raw-text scan (`biome.json` overrides); their routes join
  `MIGRATED_ROUTES` (`/submissions`, `/submissions/new`, `/submissions/[id]`, `/reviews`,
  `/reviews/[id]`), so the phone sweep runs them in Portuguese and French; a component test per area
  in three languages, with the English-leak guard; a test per new error class.

**Out** (and where it goes instead):
- **The messages `@ronneai/core` writes**: the manifest checks (`ManifestIssue.message`, 37 codes
  plus the schema's), the risk flags' sentences and the renderers' warnings. `rmk validate` and
  the registry print the same text, and the API returns it, so it stays English in every language,
  shown as it comes inside a translated frame. See Decisions.
- Admin pages, Admin › Scopes and Workspaces (the scope's dialogs, `InvalidScopeNameError`,
  `ScopeNameTakenError`), settings, setup, SSO and SCIM, the remaining helpers: 132.
- Item content, what people write (descriptions, review comments, release notes, file contents)
  and names: stay as authored.
- Native-speaker review of the new Portuguese and French: 133.

## Behaviour

- **No visible change in English.** Every English text stays as it is, except where it joined
  pieces in code and has to become a whole sentence; there the English reads the same. One
  English line changes on purpose: the Works in tab said "Goes to installs its items." for a
  bundle (a place phrase dropped into the "Goes to" sentence); it now says "Installs its items one
  by one." On that tab a key or a file stays in code and the words around it (" in ") are prose.
- **Whole sentences** with placeholders, ICU plurals and `select` (129, 130): "{n} files",
  "Submit {count} drafts together", "Waits on {name}", a status inside a sentence. A sentence with
  a link or a `<code>` uses rich-text tags (`<mono>…</mono>`), never a split around the element.
- **Statuses** (draft, submitted, changes requested, approved, rejected, withdrawn, published) are
  one set of messages, used by the badge, the filters and the sentences that name a status.
- **Item types and file paths** stay as `rmk` prints them (130's rule): `ronne.yaml`, `SKILL.md`,
  `skill`, `mcp-server`.
- **Version numbers, tags and ranges** (`1.2.0`, `latest`, `^1.0.0`) are data: inserted as given.
- **Bump names** (major, minor, patch) stay the semver terms in every language, as `rmk` and the
  Documentation use them; what each means is translated beside it ("Minor: novidades,
  compatível"). The glossary has them.
- **Core's messages** show as they come, in English, inside the translated list (its heading,
  counts, severities and "line {n}" are messages). They keep their `backticked` names as code. So
  do the registry's own checks reported the same way (013's dependency checks on the canvas and in
  the Problems list), which the API returns as issues too.
- **React Flow's screen-reader texts** (how to select and move a node, where it moved, each
  node's and edge's role word, and each edge's label) are messages; React Flow takes the how-to
  texts once the page loads, so the server's first markup has its English defaults until then. An
  edge reads as a sentence, "@team/a depends on @team/git", in English too (it was React Flow's
  "Edge from item to dependency:@team/git"). One label stays English: the attribution link's
  "React Flow attribution", which the library fixes and only a paid plan can hide.
- **Problems with a code are UI text.** Where core gives a code a screen can word, the screen
  words it: a name's problem (`nameProblem`), a file path's (`pathProblemOf`, added for this
  feature beside `pathProblem`, whose English `rmk` and the API keep).
- **Lists of names** ("Needed by @a, @b and @c", "with @a and @b") follow the language's list
  format, as 130's did: English writes three or more with a comma before "and".
- **Errors.** A known error shows its translation; an error with no translation shows the English
  message (never a blank). The API's messages are unchanged.

## Edge cases

- Long Portuguese and French labels in the editor's toolbar, the decision bar and the bulk
  dialogs must not break the layout on a phone: the sweep runs these pages in each language.
- A draft's name, a scope, a version or a path inside a translated sentence is data, shown as
  typed even if it looks like a placeholder (`{x}`).
- Counts of 0, 1 and 2 follow each language's plural rule (tests check all three).
- The editor's unsaved-changes guard (the browser's own "leave page?" prompt) is the browser's
  text and follows the browser's language, not the app's; nothing to do.
- A deep link to a draft, a review or a version keeps working in every language; no URL changes.

## Documentation

- **Items (proposing and the editor), Export, Review, Versions, Changes** (`items.tsx`,
  `export.tsx`, `review.tsx`, `versions.tsx`, `changes.tsx` in ronne-web): the Portuguese and French pages take the new names of the labels they mention, from the
  message files; English is unchanged. No new topic or section, so neither `topics.ts` changes.
- **Helpers:** the 27 entries above are now in three languages; no new helper.
- `docs/knowledge/i18n.md`: the glossary gains the words these screens add (draft, submit,
  withdraw, request changes, approve, reject, release, bump, deprecate, yank, tag, dependency,
  version range).

## Acceptance criteria

- [x] Propose item, the draft editor (form, YAML, files, canvas), My submissions, Reviews and a
      review's page, the item page's Files and Versions tabs, and the bulk dialogs render in
      English, Portuguese and French with no English text left over (core's messages and data
      aside), on desktop and on a phone.
- [x] The raw-text scan covers every folder listed in Scope and passes; the phone sweep runs their
      routes in Portuguese and French.
- [x] Every action in scope returns a code or a translated message; the submissions errors and the
      items errors listed have a text in all three languages (a test for each class, with 0/1/2
      counts and lists where they have them); the API's messages are unchanged, but for the
      `InvalidStatusTransitionError` fix stated in Scope.
- [x] The 27 helpers read in the person's language and their links open the website's page in it.
- [x] The key-parity and placeholder tests pass.
- [x] The Portuguese and French Documentation pages name these screens' labels as the app does.

## Decisions

- **Core's messages stay English** (owner, 2026-10-23, taking Claude's proposal): `ManifestIssue.message`, the
  risk flags and the renderers' warnings come from `@ronneai/core`, which `rmk` and the API share;
  translating them would mean a code-to-message table for about 40 codes plus the JSON schema's
  messages, kept beside core's. The frame around them is translated. 133 can revisit it with the
  native reviewers.
- **The rest follows 130's decisions**: the actions say their own words (success lines from
  `getTranslations`, errors from `errorText`); the helpers move by area; type names stay as `rmk`
  prints them.

- **"Retirar" / "retirer" for both withdraw and yank** (owner, 2026-10-23): 130 already uses it
  for a yanked version, and 131 for withdrawing a submission. They sit on different screens; the
  native reviewers in 133 settle whether withdraw gets another word.

## Open questions

None.
