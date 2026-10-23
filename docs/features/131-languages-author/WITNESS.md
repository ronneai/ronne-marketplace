# 131 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — Shared words

Witnessed: 2026-10-23 09:46 EDT, by a fresh agent (blind). Commit: 9d2cb894. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The seven statuses are one set of messages (`author.status`), and `StatusBadge` takes them from it | no | confirmed | `StatusBadge.tsx:20-22` uses `useTranslations("author.status")` / `t(status)`; `messages/{en,pt,fr}/author.json` `status` has draft…published with `withdrawn` as archived/arquivado/archivé; `translations.test.tsx` loops over `SUBMISSION_STATUSES` in all three languages. Mutation: fr `draft` set to "draft" → "fr: every status…" fails (1 failed / 10 passed) |
| 2 | `ProposalBadges` and `DependencyMarks` (badge, icon, notice, hint) take their words from `author.proposal` / `author.marks` | no | confirmed | `git show 9d2cb894` → both call `useTranslations`; the old `markText`/`markStatus` exports are gone and nothing else used them (grep); `npx tsc --noEmit -p apps/web` in a scratch copy → no errors |
| 3 | The new `author` namespace has its three files and is in `namespaces.ts` (the list and the type) | no | confirmed | `namespaces.ts:4,37,57`; `npx vitest run src/i18n` → "en/pt/fr has exactly the namespaces NAMESPACES lists" and "author: English has no empty text" pass |
| 4 | `components/submissions` joins the raw-text lint scan | no | confirmed | `biome.json:26` lists it; `npx biome check …/submissions` → clean. Mutation: `{t("stale")}` replaced by raw `stale` → `ProposalBadges.tsx:21:75 plugin`, "Found 1 error" |
| 5 | Three-language tests of the badges and marks, with the English-leak guard, pass and catch regressions | no | confirmed | `npx vitest run src/components/submissions src/i18n` → 16 files, 188 tests passed. Mutation: `blockedHint` written in English in the component → "pt/fr: the notice leaves no English behind" fail (2 failed). Remark: the guard skips a pt/fr message identical to English, so pt `waits.changes_requested` reverted to English still passed; the `waits` words weren't each asserted |
| 6 | The parity test passes for `author` (keys, placeholders, valid ICU) | no | confirmed | `messages.parity.test.ts` → pt/author and fr/author pass. Mutation: pt `waitsOn` without `{dependency}` → "pt/author has every key…" fails (1 failed / 48 passed) |
| 7 | No visible change in English | no | confirmed | A probe compares the pre-131 `markText`/`markStatus` with `useMarkWords` in English for all 8 mark shapes, and `StatusBadge` with `statusLabel` for all 7 statuses → identical; the icon labels, notice titles and hint match the old strings |
| 8 | Data inside sentences is shown as typed; counts 0/1/2 follow each language's plural rule; pt/fr typography | no | confirmed | Probe: dependency, `through` and version set to `{status}`, `'{x}'`, `#`, `{count, plural, other {x}}`, `<b>` → shown verbatim in en/pt/fr. 0/1/2: pt and fr 0 and 1 singular, 2 plural; en "0 dependencies"; 0 marks renders no icon in every language. pt "Bloqueado:" with no space; fr "Bloqué :" with a space and `’` |

**Overall:** met.

Row 5's remark is closed in the tick commit: `translations.test.tsx` asserts each `waits` word in en, pt and fr ("words each waiting status for its badge"; 20 tests pass).

## Task 2 — Files, code and checks

Witnessed: 2026-10-23 09:59 EDT, by a fresh agent (blind). Commit: c3d98242. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's own tests and the i18n parity tests pass | no | confirmed | `npx vitest run src/components/{files,validation,code,risk-flags,tools,markdown} src/i18n` → 18 files, 211 tests passed |
| 2 | Three-language tests cover the Files tab, viewer, tree, editor label, diffs, issues list, popover and risk summary, with the English-leak guard | no | confirmed | `components/files/translations.test.tsx` and `components/validation/translations.test.tsx` render en/pt/fr and run `englishLeaks` / `ownTextsShown`. Mutation (pt `errors` reduced to `other`) → 2 failed |
| 3 | A test checks that a core message stays as given inside the translated list | no | confirmed | `validation/translations.test.tsx` expects `` `name` is required. `` as code in all three languages; mutating the message → that test failed. Risk flag sentence checked the same way |
| 4 | Counts of 0, 1 and 2 follow each language's plural rule | no | confirmed | Test cases in `validation/translations.test.tsx`; probe of the risk heading |
| 5 | The six folders are in the raw-text scan | no | confirmed | `biome.json` lists all six; planted raw text in IssueList, `tools/` and `markdown/` → biome `plugin` errors on all three |
| 6 | `components/tools` text is moved into the languages | no | not met | `tool-paths.ts` still held English: "installs its items", "hooks in …", "a local plugin under …"; the Works in tab showed "Vai para installs its items." in pt |
| 7 | `?tab=files` reads in the language | no | confirmed | `FilesBrowser` rendered in pt and fr → `englishLeaks(["author","common","item"])` = `[]` |
| 8 | Core's messages show as they come, with `backticks` as code | no | confirmed | `IssueList.tsx` and `RiskSummary.tsx` pass the messages unchanged to `CodeText`; probe with placeholders shown as given |
| 9 | Data inside a translated sentence is shown as typed | no | confirmed | Probe: `{x}/'a'.md`, `{name}.md`, `.ronne/{x}.md` shown as given |
| 10 | Sizes follow the language and round as core's `formatBytes` | no | confirmed | Probe at 11 sizes: same numbers; "1,5 MB" (pt), "1,5 Mo" (fr), no grouping. Except 1 MiB+1, row 11 |
| 11 | No visible change in English | no | partly | `useBytes(1048577)` → "1 MB" where `formatBytes` gave "1.0 MB"; "revision 1,234" and "(1,500)" grouped where they weren't |
| 12 | pt and fr grammar and typography | no | partly | `diff.ronne` was singular for several paths in pt and fr ("também mudou", "a aussi changé") |

**Overall:** not met: rows 6, 11, 12.

### Re-check (rows 6, 11, 12)

Witnessed: 2026-10-23 10:05 EDT, by a fresh agent (blind). Commit: bde5a1f6. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 6 | The Works in tab words each tool's place (keys in a file, paths, a section of AGENTS.md, a local plugin, a bundle) in pt and fr, with no English left | no | confirmed | `tool-paths.ts` holds only data (`ToolPlace`); `ToolsPanel.tsx` words it through `item.tools.place.*` and `item.tools.bundle`. Probe over 11 types × 3 tools in pt and fr: no English. Five mutations each fail `tools-panel.test.tsx` |
| 11 | No visible change in English for sizes or for numbers shown before without grouping | no | confirmed | Probe: 20 sizes equal `formatBytes` (MB+1 → "1.0 MB"); "revision 1500" and "(1500)" ungrouped. Mutations of `bytes.ts` and the two `::group-off` → tests fail |
| 12 | pt and fr grammar in `author.diff.ronne` and the new `item.tools.place` / `item.tools.bundle` | no | partly | `ronne` is a plural on `count`: "mudou"/"mudaram", "a changé"/"ont changé"; mutations caught. But fr `place.section` "une section de AGENTS.md" doesn't elide |
| 13 | No visible change in English in the Works in tab | no | partly | Identical for every type except bundle: "Goes to installs its items." became "Installs its items one by one.", not recorded in SPEC.md |

**Overall:** not met: rows 12 (the French elision) and 13 (SPEC.md).

### Re-check (rows 12, 13)

Witnessed: 2026-10-23 10:10 EDT, by a fresh agent (blind). Commit: 978e5187. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12 | French `item.tools.place.section` reads correctly ("Va dans une section du fichier AGENTS.md."), and the other place and bundle messages in pt and fr have no elision or agreement errors | no | confirmed | fr section `une section du fichier <code>{path}</code>`; key `la clé … de <code>{path}</code>` (every key path starts with `.`); pt messages correct. `tools-panel.test.tsx` asserts it; mutation back to `une section de` → 1 failed. `npx vitest run src/features/item-page src/i18n` → 249 passed |
| 13 | SPEC.md records the English bundle line change, and no other English on the Works in tab changed | no | confirmed | `SPEC.md` "No visible change in English" names it; `git diff c3d98242~1 HEAD` on `en/item.json`, `ToolsPanel.tsx`, `tool-paths.ts` → the native, degraded, off and none strings unchanged; every old place gives the same words, only which words are in code changed, as recorded |

**Overall:** met.

## Task 3 — The dependency canvas

Witnessed: 2026-10-23 10:22 EDT, by a fresh agent (blind). Commit: 98f2cb62. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The canvas nodes' text and controls are messages in en/pt/fr | no | confirmed | `nodes.tsx`, `ComposerCanvas.tsx` use `author.canvas` / `common.field`; probe → pt "intervalo", "funciona em Claude Code", "não publicado", "Aumentar o zoom"; fr "plage", "non publié", "Zoom avant" |
| 2 | The composer's dependency list, the YAML notice and the catalogue picker are in three languages | no | confirmed | `npx vitest run src/features/draft-editor/composer-canvas src/features/draft-editor/dependency-picker src/features/item-page/overview src/i18n` → 20 files, 279 passed; probe → pt "Resultados do catálogo", "v1.0.0, seu"; fr "Ajouter @t/{n}" |
| 3 | The picker's model is structured data and `words.ts` words it | no | confirmed | `acceptsOf` returns `{kind,…}`; probe → pt "^2.0.0 · a 2.0.0 ou uma 2.x posterior, a mais recente", group "Exata"; `^1.0.0-beta` → null as before |
| 4 | The `@` mention detail uses the translated status | no | confirmed | `DraftEditor.tsx` `detail: ${option.type} · ${wordsNow.current.statusText(option)}`; `statusText` tested in three languages |
| 5 | The three-language tests fail without the change | no | confirmed | Mutations (`t("notPublished")` → literal; "yours" dropped) → 5 failed; restored, `cmp` identical |
| 6 | The three folders are in the raw-text scan | no | confirmed | `biome.json` lists them; planted literals → `plugin` errors |
| 7 | No visible change in English | no | confirmed | `composer.test.tsx` unchanged and passing; `dependency-picker.test` keeps its English expectations through `usePickerWords`; probe en strings equal the old ones |
| 8 | Core's and the registry's checks show as they come | no | confirmed | `translations.test.tsx` → pt ">ERRO:<", the message's code and English text |
| 9 | React Flow's screen-reader texts are messages, with English defaults in the first server markup | no | confirmed | `useAriaLabels` → fr live message; probe x=12345 ungrouped; SSR how-to shows React Flow's defaults, as the spec allows |
| 10 | Versions, ranges and names are data | no | confirmed | probe → "v{v}", "publié en {v}, à vous", "@team/{x}, mcp-server, intervalo 1.0.0" |
| 11 | Counts follow the plural rule | no | confirmed | The only count in scope is a bare number in `dependenciesCount` |
| 12 | The Overview's canvas (130) has no English left | no | partly | Edges keep React Flow's `aria-label` "Edge from item to dependency:@team/git"; `aria-roledescription` "node"/"edge"; "React Flow attribution" fixed by the library and not in SPEC.md; the server render draws no edges, so the test can't see them |

**Overall:** not met: row 12.

### Re-check (row 12)

Witnessed: 2026-10-23 10:26 EDT, by a fresh agent (blind). Commit: 4ff5e281. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12a | Each edge's label is a sentence in the person's language | no | confirmed | `toFlowEdges` sets `ariaLabel` from `t("edge")`; React Flow reads it before its fallback; probe → en "@team/reviewer depends on @team/git", pt "… depende de …", fr "… dépend de @team/{x}" |
| 12b | Nodes and edges carry a translated role word | no | confirmed | `domAttributes` spread after React Flow's own; probe → pt "nó"/"ligação", fr "nœud"/"lien"; only "React Flow attribution" left |
| 12c | SPEC.md names what can't be changed | no | confirmed | SPEC.md Behaviour names "React Flow attribution" and the how-to texts' first markup |
| 12d | SPEC.md records the English change to the edge label | no | confirmed | SPEC.md: "An edge reads as a sentence … (it was React Flow's 'Edge from item to dependency:@team/git')" |
| 12e | Tests cover edge labels and roles and fail when the fix is undone | no | partly | `toFlowEdges` mutations fail the test, but undoing the call site in `ComposerCanvas.tsx` (English label, `role: "edge"`) failed none |
| 12f | The rest of task 3's tests pass | no | confirmed | 8 files, 111 passed |

**Overall:** not met: row 12e.

### Re-check (row 12e)

Witnessed: 2026-10-23 10:29 EDT, by a fresh agent (blind). Commit: 5918d0e9. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12e | A test covers what ComposerCanvas hands React Flow (edge labels, edge role, node role) in en, pt and fr, and each mutation fails it | no | confirmed | `flow-labels.test.tsx` records `ReactFlow`'s props and renders the real `ComposerCanvas`. English label at the call site → 2 failed; `role: "edge"` → 1 failed; `{ role: "node" }` → 1 failed; edge `domAttributes` dropped → 2 failed; node `domAttributes` dropped → 2 failed; restored, `cmp` identical. Canvas, composer, picker and item-page tests → 12 files, 156 passed |

**Overall:** met.

## Task 4 — The draft editor: form and YAML

Witnessed: 2026-10-23 10:44 EDT, by a fresh agent (blind). Commit: dbf37325. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass | no | confirmed | form-translations, submissions, issues, manifest-form, manifest-validation, pages-coverage, messages.parity → 7 files, 119 passed |
| 2 | Three-language tests of the new-draft form | no | partly | Only the form's first state and the no-scopes notice are rendered; English put back in the side panel, the repeat note or the name hint, or the tag search dropped, keeps the tests green |
| 3 | Three-language tests of the manifest form with each item type's fields | no | confirmed | Every `ITEM_TYPES` form rendered in pt and fr with `englishLeaks`; mutations fail it |
| 4 | The route is in `MIGRATED_ROUTES` and the pinned list | no | confirmed | `e2e/pages.ts` and `pages-coverage.test.ts`; removing it fails the coverage test |
| 5 | The type picker's tags are messages, shown and searched in the language | no | confirmed | `types.tag.*` in three languages; probe: pt "ciclo" finds `hook` |
| 6 | No visible change in English | no | confirmed | 27 states rendered at HEAD and at HEAD~1's sources in English → identical |
| 7 | Name problems keyed by a code are UI text, English as core's | no | confirmed | `common.nameProblem` matches `packages/core/src/names.ts` |
| 8 | ronne.yaml keys, types and file paths stay as written | no | confirmed | pt `>description<`, `>license<`; keys carry `biome-ignore` with a reason |
| 9 | Data inside a sentence is shown as typed | no | confirmed | `{x}.md (manquant)`, header value `{x}` kept |
| 10 | `issues.ts`'s AS_OF_SAVE notice is a message | no | confirmed | `asOfSave` boolean; `DraftEditor.tsx` → `formText("asOfSave")` |
| 11 | The YAML view is in the language | no | partly | The editor's Form/YAML/Canvas switch and its legend "ronne.yaml view" are English |
| 12 | The moved folders are in the raw-text scan | no | confirmed | `biome.json`; planted literals → `plugin` errors |
| 13 | `features/manifest-validation` and `app/(app)/submissions/new` are moved | no | confirmed | `submissions.test.tsx` "New item in three languages" with `englishLeaks` → [] |
| 14 | pt/fr typography and glossary | no | partly | `ManifestForm.tsx` joins the map field's aria-label in code: fr "headers 1: Nom" |
| 15 | Plurals follow each language | no | confirmed | `typesCount` is an ICU plural |

**Overall:** not met: rows 2, 11, 14.

### Re-check (rows 2, 11, 14)

Witnessed: 2026-10-23 10:50 EDT, by a fresh agent (blind). Commit: 1d57584a. Machine: macOS 27.0.1, Node 24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | pt/fr tests cover the form's other states, and English put back fails a test | no | partly | `StarterFiles`, `NameHint`, `RepeatNote`, `useTypesMatching` tested; ten mutations each fail 1–5 tests. Not covered: "no type matches" (`t("noType")`), English there keeps 379 tests green |
| 11 | The switch and its legend read in the language, and are tested | no | confirmed | `ViewSwitch`: pt "Formulário"/"Visão do ronne.yaml", fr "Formulaire"/"Canevas"/"Vue de ronne.yaml"; mutations fail |
| 14 | The map field's aria-label is one message with the language's typography | no | confirmed | `t("mapPart")`; fr "{field} {n} : {part}"; tests assert pt and fr; mutations fail |
| 15 | No visible change in English for these pieces | no | confirmed | The pieces moved unchanged; en adds `views`, `viewsLegend`, `mapPart` equal to the old text |
| 16 | The task's tests pass | no | confirmed | 24 files, 379 passed |

**Overall:** not met: row 2.

### Re-check (row 2)

A third round, with the owner's approval (2026-10-23).

Witnessed: 2026-10-23 10:55 EDT, by a fresh agent (blind). Commit: da5a9aa3. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 2 | The "no type matches" line is rendered by a test in en, pt and fr, the form uses that piece, and English put back fails a test | no | confirmed | `NoTypeMatch` exported and rendered by the form; the test checks the sentence in en/pt/fr. English in the component, the pt message or the fr message → 1 failed each; restored, `cmp` identical. 24 files, 380 passed |

**Overall:** met.

## Task 5 — The draft editor: files, proposals and submit

Witnessed: 2026-10-23 11:10 EDT, by a fresh agent (blind). Commit: 2ed70039. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's own tests and the page-list test pass | no | confirmed | `npx vitest run src/features/draft-editor/ src/app/pages-coverage.test.ts` → 14 files, 195 passed; i18n 57 passed; core `package-checks` 31 passed |
| 2 | `DraftEditor` speaks pt and fr, with no English left | no | confirmed | `editor-translations.test.tsx` checks each notice in pt/fr; the leak test covers 6 states; a pt message set to English fails it |
| 3 | Each `FileDialogs` dialog has three-language tests | no | partly | Delete, zip import and settings tested; add and rename only with a title the test passes in; their real words and the upload's `tooBig` untested |
| 4 | `ProposalBar` in three languages | no | confirmed | fresh, stale, submitted vs draft, conflicts covered |
| 5 | `SubmitDialogs` in three languages | no | confirmed | submit, group, outcome, withdraw, delete archived, restore; a mutation fails the label test |
| 6 | Submit preview with 0, 1 and 2 drafts tested in each language | no | partly | Behaviour right; tests miss fr 0/1, pt 2 and the group heading at 1 |
| 7 | Withdraw dependents 0/1/2 follow plurals | no | confirmed | en 1, pt 1 and 2, fr 0 and 2 |
| 8 | `/submissions/[id]` page in messages | no | confirmed | `generateMetadata`, `approvedTitle`, `approvedText`; the raw-text override covers it |
| 9 | The route is in `MIGRATED_ROUTES` | no | confirmed | removing it fails `pages-coverage.test.ts` |
| 10 | Core's `pathProblemOf` beside `pathProblem`, English unchanged | no | confirmed | `package-checks.test.ts` unchanged and passing |
| 11 | Path problems worded by code in the UI | no | confirmed | `PathIssue` data; "words each path problem" in pt/fr/en |
| 12 | No visible change in English | no | partly | "Saved at" moved from the browser's `toLocaleTimeString()` to the provider's zone, the server's: a Toronto reader on a UTC server sees 3:10 PM instead of 11:10 AM |
| 13 | Lists of names follow each language's list format | no | confirmed | `format.list` conjunction; en "@t/agent, @t/skill, and @t/x" |
| 14 | Placeholder-looking data shown as typed | no | confirmed | probe in all three languages |
| 15 | Core's messages show in English inside the list | no | confirmed | `IssueList` renders them as they come |
| 16 | Withdraw flags review history instead of comparing English | no | confirmed | `reviewHistory: true`; `actions.test.ts` |
| 17 | Lint passes on the folder | no | partly | an unused `type ReactNode` import in `DraftEditor.tsx` |

**Overall:** not met: rows 3, 6, 12, 17.

### Re-check (rows 3, 6, 12, 17)

Witnessed: 2026-10-23 11:25 EDT, by a fresh agent (blind). Commit: d7466f27. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The new file, new folder and rename dialogs and the too-large message are tested in three languages | no | confirmed | `NewPathDialog`, `RenamePathDialog`, `useTooBig` tested; each word written in English in the code fails 1–3 tests |
| 6 | Submit's label at 0, 1, 2 and the group heading at 1, 2 in each language | no | confirmed | mutations fail their test |
| 12 | "Saved at" uses the reader's zone, and a test fails when that's undone | no | partly | The code is right (`timeZone` from the browser); the test passed with the line removed, as tests run in one zone |
| 17 | No unused import | no | confirmed | `biome check` reports nothing |
| 18 | The task's tests pass, and the editor uses the tested pieces | no | confirmed | 14 files, 247 passed |

**Overall:** not met: row 12.

### Re-check (row 12)

A third round, with the owner's approval (2026-10-23).

Witnessed: 2026-10-23 11:25 EDT, by a fresh agent (blind). Commit: eb813672. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 12 | "Saved at" shows the reader's zone in en, pt and fr; its test fails when that's undone, on a UTC machine too | no | confirmed | The test mocks `resolvedOptions` to `Pacific/Kiritimati`; passes on the committed code with TZ unset, UTC and America/Toronto; the line removed, set to "UTC" or "Asia/Tokyo" → 1 failed under UTC and Toronto each time. The four path-dialog words are each checked in pt and fr |

**Overall:** met.

## Task 6 — My submissions

Witnessed: 2026-10-23 11:30 EDT, by a fresh agent (blind). Commit: 1180273a. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass, with three-language tests of the filters, table, row feedback, empty states, `ArchivedActions`, `BulkSubmit` and the page | no | confirmed | 5 files, 110 passed; `submissions.test.tsx` "My submissions in three languages (131)" with `englishLeaks` for pt and fr |
| 2 | The status filters use `author.status`; `statusLabel` is gone from the screen | no | confirmed | `t("submissions.statusCount", { status: t(\`status.${s}\`) … })`; mutation → 6 tests fail |
| 3 | No visible change in English | no | confirmed | Old and new English compared in the diff; counts now use `{count, number}` (1,000+ grouped) |
| 4 | Whole sentences with ICU plural and `select` | no | confirmed | `fixFirst`, `fixFirstTitle`, `submitCount` plurals; `feedback` with `select` |
| 5 | Data shown as typed | no | confirmed | `{count}`, `{by}`, `{body} <b>` shown verbatim in pt and fr |
| 6 | Counts of 1 and 2 follow each language's plural rule | no | confirmed | Tests assert issues and drafts at 1 and 2 |
| 7 | The table footer's noun is right for 0, 1 and 2 in three languages | no | partly | Behaviour right; no test: `noun="item"` left every test green |
| 8 | The route is in `MIGRATED_ROUTES` and the pinned list | no | confirmed | `e2e/pages.ts`, `pages-coverage.test.ts` |
| 9 | The folders are in the raw-text scan, lint clean | no | confirmed | `biome.json`; a raw `Delete` → lint error |
| 10 | pt/fr typography and glossary | no | confirmed | fr space before colons, curly apostrophes; pt none |
| 11 | Server `reasons` and `<Help>` stay as they are | no | confirmed | Out of scope (tasks 10, 11) |

**Overall:** not met: row 7.

### Re-check (row 7)

Witnessed: 2026-10-23 11:34 EDT, by a fresh agent (blind). Commit: 4cb300a1. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | The footer's noun is right for 0, 1 and 2 in en, pt and fr, and a test asserts it | no | confirmed | The new test checks all nine cells; `noun="item"`, en without `one`, pt `other` singular, fr `one` plural → each fails it; 40 passed |

**Overall:** met.

## Task 7 — Reviews: the queue

Witnessed: 2026-10-23 11:45 EDT, by a fresh agent (blind). Commit: c50bf82b. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The queue, the batch review, its results and the page's title and header are messages in `author.queue` | no | confirmed | `QueueTable.tsx`, `BulkApprove.tsx`, `reviews/page.tsx` use only `t(...)`; the three `queue` blocks have the same keys |
| 2 | Three-language tests exist and fail without the translations | no | confirmed | 31 passed; pt `empty.waiting` in English, pt `approve.title` without plural → each fails |
| 3 | `/reviews` is in `MIGRATED_ROUTES` | no | confirmed | `e2e/pages.ts`, `pages-coverage.test.ts`; removing it fails |
| 4 | The five files are in the raw-text scan | no | confirmed | `biome.json`; a raw `Deselect all` → plugin error |
| 5 | No visible change in English | no | confirmed | `QueueTabs` and `QueueTable` rendered at HEAD and HEAD~1 → identical (57,134 bytes) |
| 6 | Statuses are one set of messages | no | confirmed | `StatusBadge`; tab labels from `queue.tabs` |
| 7 | Whole sentences | no | partly | The batch summary is `summary` in `<strong>` plus an `overrides` fragment or a raw "." joined in code |
| 8 | Names inside sentences are data | no | confirmed | `@t/{x}` shown as typed |
| 9 | Counts of 0, 1 and 2 follow each language's plural rule | no | not met | `approve.selected` has no plural: pt "1 selecionadas", fr "1 sélectionnées", "0 sélectionnées" |
| 10 | Types and risk kinds stay as codes | no | confirmed | `ITEM_TYPES`, `TypeBadge`, `⚠ {kind}` |
| 11 | pt/fr typography and glossary | no | confirmed | Remark: pt kept the English "override" |

**Overall:** not met: rows 7 and 9.

### Re-check (rows 7, 9)

Witnessed: 2026-10-23 11:46 EDT, by a fresh agent (blind). Commit: e720e574. Machine: macOS (Darwin 27), Node v24.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 7 | The summary is one message per language, English unchanged, tested at 0, 1 and 2 overrides | no | confirmed | One `t.rich("summary", { count, overrides, strong })`; English words identical; pt `=0 {.}` → `=0 {}` fails 2 tests; 229 passed |
| 9 | "N selected" follows each language's plural rule at 0, 1 and 2, and a test fails when undone | no | confirmed | pt and fr plurals; set back to `{count, number} …` → 1 test fails in each |
| 10 | Root's override is "exceção" / "dérogation", and the glossary records it | no | confirmed | `author.json`; `i18n.md` glossary row; the test expects ">Aprovada (exceção):<" |

**Overall:** met.

## Task 8 — Reviews: a review's page

Witnessed: 2026-10-23 11:58 EDT, by a fresh agent (blind). Commit: 9aecc4ff. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Each decision is worded through messages, tested in three languages | no | partly | Tests sample one language per decision; fr titles and hints set to English passed |
| 2 | The publish dialog has three-language tests | no | partly | The success notice (`done` / `doneWith`) in no test |
| 3 | `/reviews/[id]` is in `MIGRATED_ROUTES` | no | confirmed | `e2e/pages.ts`, `pages-coverage.test.ts`; removal fails |
| 4 | The raw-text lint covers the folders | no | confirmed | `features/reviews/**`, `app/(app)/reviews/**`; planted text → 2 errors |
| 5 | Core's `tagProblemOf` beside `tagProblem` | no | confirmed | Server keeps `tagProblem`; `versions.test.ts` 4 passed; mutation fails |
| 6 | Bump reasons are data the dialog words; English as before | no | partly | English byte-identical; `depNew`→`fileNew` passed `bump.test.ts` |
| 7 | No visible change in English | no | confirmed | Old English tests pass; lists follow the list format |
| 8 | Statuses from one set of messages | no | confirmed | `DependentsChoice` uses `author.status` |
| 9 | Whole sentences | no | confirmed | `t.rich` for preview, suggestion, by, submitted; plural legend |
| 10 | Bump names as the spec said | no | partly | pt/fr keep major/minor/patch; the spec then asked for translated words |
| 11 | Data shown as typed | no | confirmed | Probe with `{x}` values in names, versions, paths |
| 12 | Counts of 0, 1 and 2 | no | partly | The dependents' legend hardcoded "1" in `one`, so 0 read "1 …" in pt and fr |
| 13 | pt/fr typography and glossary | no | partly | fr "parce que il …"; fr `publish.stuck` ungrammatical |
| 14 | What people write and out-of-scope text stay as given | no | confirmed | Event bodies raw; reasons passed as values; `<Help>` English until task 11 |
| 15 | The task's tests and lint pass | no | confirmed | 247 passed; db 18 passed; core 4 passed; lint clean |

**Overall:** not met: rows 1, 2, 6, 10, 12, 13.

### Re-check (rows 1, 2, 6, 10, 12, 13)

Witnessed: 2026-10-23 12:03 EDT, by a fresh agent (blind). Commit: a87e0a19. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every decision's title, hint and button tested in pt and fr | no | partly | Most mutations fail; the request-changes title equals its button text, so an English title still passed |
| 2 | The success notice tested in three languages | no | partly | `PublishedNotice` tested; fr with no others not asserted |
| 6 | `suggestBump`'s reason kinds fully asserted | no | confirmed | `toEqual` on every kind; `depNew`→`fileNew` fails |
| 10 | Bump names match SPEC.md and the glossary | no | confirmed | SPEC: semver terms stay, meanings translated; glossary row |
| 12 | The dependents' legend shows the count | no | confirmed | `one {# …}`; 0 tested in pt and fr |
| 13 | The French grammar errors fixed and tested | no | partly | "car" tested; `publish.stuck` rendered by no test |
| 14 | The task's tests pass | no | confirmed | 47 passed |

**Overall:** not met: rows 1, 2, 13.

### Re-check (rows 1, 2, 13)

A third round, with the owner's approval (2026-10-23).

Witnessed: 2026-10-23 14:22 EDT, by a fresh agent (blind). Commit: ac946c4d. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The request-changes title is tested on the dialog's heading | no | confirmed | pt and fr title set to "Request changes" → each fails |
| 2 | The notice with no others is tested in fr and pt | no | confirmed | English `done` in fr and in pt → each fails |
| 13 | `publish.stuck` is rendered and tested in fr and pt | no | confirmed | The old fr wording and a wrong pt one → each fails |
| 14 | The reviews tests pass, tree clean | no | confirmed | 70 passed; `git status` empty |

**Overall:** met.

## Task 9 — Versions and releases

Witnessed: 2026-10-23 14:28 EDT, by a fresh agent (blind). Commit: b765d0b3. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The task's tests pass | no | confirmed | 12 files, 143 passed; i18n 169 passed |
| 2 | `VersionsTab`, `VersionControls` and `ChangeDialog` speak pt and fr, with tests | no | confirmed | All dialogs rendered open in pt and fr with a no-English check; an English `unyankText` fails it |
| 3 | `BulkRelease` speaks pt and fr, with three-language tests | no | partly | The dialog opened from the toolbar (title, submit, together, cancel, done, disabled reasons) never rendered in pt or fr; mutations there passed |
| 4 | Plan problems carry a `code` the screen words | no | confirmed | `release-plan.ts` `code` and `tag`; English `problem` kept; mutations fail |
| 5 | No visible change in English | no | confirmed | Every removed literal matches `en/author.json` |
| 6 | Counts of 0, 1 and 2 follow plural rules | no | confirmed | Probe of `release.title`, `submit`, `versions.reach` |
| 7 | Numbers follow the language | no | partly | `format.number` in `VersionsTab.tsx`; no test catches `toLocaleString("en-US")` |
| 8 | Versions, tags and ranges are data | no | confirmed | `1.0.{x}` and `beta` kept |
| 9 | Glossary and typography | no | confirmed | obsoleta/retirada, obsolète/retirée/étiquette; fr spacing |
| 10 | The three folders are in the scan | no | confirmed | `biome.json`; planted text fails |
| 11 | The item page's remaining text | no | confirmed | `tabs.ts`, `load.ts` hold no text; `actions.ts` uses `errorText` |

**Overall:** not met: rows 3, 7.

### Re-check (rows 3, 7)

Witnessed: 2026-10-23 14:38 EDT, by a fresh agent (blind). Commit: cd3a186b. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The release dialog's own text is rendered in pt and fr by tests that fail when it goes wrong | no | partly | `ReleaseTitle` and `ReleaseFooter` tested at 0, 1, 2; code mutations fail; but pt `cancel`, pt `fixSettings`, fr `together`, fr `nothing` set to English passed |
| 7 | The 30-day counts follow the language | no | confirmed | `>1.240<`, `>12.345<`, `>1 240<`; `toLocaleString("en-US")` fails it |

**Overall:** not met: row 3.

### Re-check (row 3)

A third round, with the owner's approval (2026-10-23).

Witnessed: 2026-10-23 15:19 EDT, by a fresh agent (blind). Commit: 89064c7f. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | Any `author` message set to its English value in pt or fr fails a test; the allowlist is per language and names only identical messages | no | confirmed | `author-untranslated.test.ts`: the four cases and 11 more across the namespace each fail; translating an allowlisted entry fails the allowlist check; 193 tests pass |

**Overall:** met.

## Task 10 — What the actions say

Witnessed: 2026-10-23 15:44 EDT, by a fresh agent (blind). Commit: d7f1a351. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `errors.json` has every submissions class but the base and `ReleasePackError`, and the six items classes, in en, pt, fr | no | confirmed | Node probe: 48 submissions classes (the plan said 44), all in the three files; `ReleasePackError` absent as the spec says |
| 2 | A test per class, in three languages, with variants, lists and plurals | no | confirmed | `src/i18n` 457 passed; deleting pt `TagRuleError` → 4 failed |
| 3 | The action files give errors through `errorText` and their own lines through messages | no | confirmed | grep of the in-scope `actions.ts`; `author.actions.*` in three languages |
| 4 | An untranslated error still shows its English | no | confirmed | `ReleasePackError` in fr → English; mutating the fallback fails it |
| 5 | Sentences built from English pieces carry codes; English word for word | no | confirmed | Message strings unchanged in the diff; core's `pathProblem`/`tagProblem` built from the `…Of` codes |
| 6 | The API's messages are unchanged (a test) | no | confirmed | 11 exact strings; mutating `VersionMessageError` fails it; no API route uses the `why` services |
| 7 | Reasons carry a `why` code; the screens word it; English matches | no | confirmed | `whyEnglish` matches each removed string; `why.test.tsx` |
| 8 | A domain error inside a reason is worded on the server | no | confirmed | `shownWhy`; every `code:"error"` reaches the browser through `whyText` or `shown()` |

**Overall:** met.

Witnessed: 2026-10-23 15:50 EDT, by a fresh agent (adversarial). Commit: d7f1a351. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | Every class but the base and `ReleasePackError`, plus the six items classes, in three languages | no | confirmed | Node script over the classes and the three files |
| 2 | A test per class in three languages | no | confirmed | Mutations of pt `TagRuleError` and the English path message fail |
| 3 | Values kept, no raw keys, plurals by language | no | confirmed | ~100 errors × 3 languages probe |
| 4 | English `errorText` equals the message | no | partly | `InvalidStatusTransitionError` reject, request_changes, override: the message read "rejectd", "request changesd", "overrided" |
| 5 | The API's and `rmk`'s messages unchanged | no | confirmed | `http/errors.ts` maps explicit fields; strings unchanged |
| 6 | No English of an action's own | no | partly | `submitSelectedAction`'s `not_a_member` reason was `NotAMemberError`'s English |
| 7 | Unknown error → English; others thrown on | no | confirmed | Probe with a new subclass |
| 8 | Reasons carry `why` beside unchanged English | no | confirmed | Every code × 7 statuses |
| 9 | The screens word the code, the Release button included | no | partly | `publish.ts` flattened the refusal into English inside the pt/fr sentence |
| 10 | No Error reaches a client component | no | confirmed | Each `code:"error"` worded on the server |
| 11 | No `why` reaches the API | no | confirmed | grep of `src/app/api`, `src/server/http` |
| 12 | Core's messages stay English | no | confirmed | `issues` unchanged under pt |
| 13 | The task's tests pass | no | confirmed | 12 files, 296 passed |

**Overall:** not met: rows 4, 6, 9.

### Re-check (rows 4, 6, 9)

Witnessed: 2026-10-23 16:03 EDT, by a fresh agent (adversarial). Commit: e74e59ca. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 4 | English `errorText` equals the message for `InvalidStatusTransitionError` with every action that reaches it | no | confirmed | 8 statuses × 12 actions probe; only an unreachable made-up action differs; removing `reject` fails `authoring-errors.test.ts` |
| 6 | Submit selected's "not a member" reads in the person's language | no | confirmed | `action-words.test.ts`; reverting fails it |
| 9 | The Release button's refusal reads in the person's language | no | confirmed | 27 `Why` variants through `publishAction`; removing the branch fails 2 tests |
| 10 | Neighbours: API mapping, the SPEC's exception, the web tests | no | confirmed | `why` never serialized; English changed only as SPEC.md states; 4806 passed |

**Overall:** met.

## Task 11 — The inline helpers

Witnessed: 2026-10-23 16:08 EDT, by a fresh agent (blind). Commit: ff03c167. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The 27 entries keep only their `href` in `HELP` | no | confirmed | `git show ff03c167 -- Help.tsx`: 27 question/answer pairs deleted, hrefs unchanged |
| 2 | `en/help.json` has the 27 with the English unchanged | no | confirmed | `compare-en.mjs` against `Help.tsx` at ff03c167~1 → 27 compared, 0 differences |
| 3 | pt and fr have all 27, same keys and placeholders | no | confirmed | Parity test passes; deleting pt `ready` fails it and 2 help tests |
| 4 | `help.test.tsx` covers the 27 | no | confirmed | MOVED lists them; fr `risk.answer` set to English fails "none of them is left as the English text" |
| 5 | Each link opens the website in the language | no | confirmed | `/pt/` and `/fr/` hrefs asserted for all 27; breaking the localising fails 4 tests; the sections exist in ronne-web |
| 6 | The screens' tests pass | no | confirmed | 24 files, 404 passed |
| 7 | French typography | no | confirmed | No space before `;?!`, a space before every `:`, no straight apostrophes |
| 8 | Button and label names match the screens and the glossary | no | partly | `deprecate-yank` said "Tornar obsoleta"/"Rendre obsolète" (button and glossary: "Marcar como obsoleta"/"Marquer comme obsolète"); bump helpers said "incremento"/"incrément" beside the "Bump" field |

**Overall:** not met: row 8.

### Re-check (row 8)

Witnessed: 2026-10-23 16:13 EDT, by a fresh agent (blind). Commit: 0472d64f. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 8 | Button and label names in the pt and fr helpers match the screens' labels and the glossary | no | confirmed | Node comparison of all 27 against `author.json` and the glossary (with the new "bump" row); no "incremento", "incrément", "Tornar obsolet", "Rendre obsol" left; 353 tests passed |

**Overall:** met.

## Task 12 — End to end

Witnessed: 2026-10-23 16:40 EDT, by a fresh agent (blind). Commit: 0bb7ab63. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `MIGRATED_ROUTES` has the five routes | no | confirmed | `e2e/pages.ts:205-209`; all five also in `SWEEP_PAGES` |
| 2 | The pinned list has them | no | confirmed | `pages-coverage.test.ts:59-63` in an exact `toEqual`; 3 passed |
| 3 | The Settings comment says 132 | no | confirmed | `pages.ts:210`; `git log -L` shows dbf37325 changed it from 131 |
| 4 | An e2e test opens a draft, the list, a review and Versions in pt and fr | no | confirmed | `e2e/languages-author.e2e.ts`; 6 passed |
| 5 | It finds English left (core's messages and data aside) | no | confirmed | Probe: the English page judged as pt → leaks; the pt page → none; a planted "My submissions" → caught |
| 6 | The phone sweep passes in each language | no | confirmed | en, pt, fr sweeps passed; `/submissions/new` keeps its earlier allowance (072) |
| 7 | Chromium and phone green on a fresh build | no | confirmed | Fresh build, then `playwright test --project chromium --project phone` → 183 passed, no retries |

**Overall:** met.

## Task 13 — Documentation and records

Witnessed: 2026-10-23 16:32 EDT, by a fresh agent (blind). Commit: 592c86ca (ronne-web d899d89). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `pnpm witness:check` passes | no | confirmed | exit 0 |
| 2 | The ronne-web branch builds | no | confirmed | Scratch copy: lint, typecheck, 183 tests, build pass |
| 3 | The pt and fr pages name the labels as the app does | no | partly | "Release fica desativado" (button "Lançar # itens"); "Incremento" (field "Bump"); "pré-release" ("Pré-lançamento"); "faixa" (node "intervalo") |
| 4 | English pages unchanged | no | partly | `en/review.tsx` shows withdrawn as "archived" (right by the app), but the SPEC said English is unchanged |
| 5 | No new topic, so neither `topics.ts` changes | no | confirmed | `git diff --stat` |
| 6 | The glossary has the words | no | confirmed | `i18n.md:139-151` |
| 7 | The index row | no | confirmed | `README.md:357` done |
| 8 | The Done notes | no | confirmed | PLAN "Done (2026-10-23)" |
| 9 | The site's guide agrees with the glossary | no | partly | Guide: "faixa de versões"; no bump rule |

**Overall:** not met: rows 3, 4, 9.

### Re-check (rows 3, 4, 9)

Witnessed: 2026-10-23 16:38 EDT, by a fresh agent (blind). Commit: 9291f46f (ronne-web d96e15f). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The pt and fr pages name the app's labels | no | partly | 157 texts match; the reject dialog's checkbox named "pedir mudanças nelas" / « demander des changements » (app: "Solicitar alterações nelas também" / « Leur demander aussi des modifications ») |
| 4 | English changes only as the SPEC states, each matching the app | no | confirmed | Exactly the 3 changes listed |
| 9 | The guide agrees with the glossary and the app | no | not met | Old rows for pre-release, deprecate/yank, stale, request changes, Canvas, rebase, release, sent back |
| 10 | Checks pass | no | confirmed | ronne-web lint, typecheck, 183 tests, build; `witness:check` |

**Overall:** not met: rows 3, 9.

### Re-check (rows 3, 9)

A third round: only wording was left.

Witnessed: 2026-10-23 16:42 EDT, by a fresh agent (blind). Commit: e011f3ec (ronne-web 53a03e8). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 3 | The pt and fr pages name the app's labels | no | confirmed | 288 texts; the checkbox now matches `review.dependents.sendBack`; only `rmk` output left in English |
| 9 | The guide agrees with the glossary and the app; the edited pages follow it | no | partly | French "pour changements" / "Demander des changements" left; guide row 82 (pt release) against its own line 217 |
| — | Checks pass | no | confirmed | ronne-web lint, typecheck, 183 tests, build; `witness:check` |

**Overall:** not met: row 9.

### Re-check (row 9)

A fourth round, with the owner's approval (2026-10-23).

Witnessed: 2026-10-23 16:50 EDT, by a fresh agent (blind). Commit: fad17746 (ronne-web fea5c25). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9a | The guide agrees with the glossary and the app | no | partly | "proposta de mudança" / « proposition de changement » and French « revue » in the guide and prose, where the app says alteração / modification and « révision » |
| 9b | No guide row contradicts another | no | not met | Rows saying "Ask to join", "Requests to join" and "Scope moves" stay English, though translated |
| 9c | The edited pages use the app's labels | no | partly | `workspaces.tsx`: New item, the Workspace filter, Submit / Submit for review, "Approved by you…", "Released without review.", Show all |
| 9d | Kept English prose words leave labels as the app's | no | confirmed | pt "Lançar selecionados", "Lançar 2 itens" |
| 9e | The SPEC describes the branch | no | partly | `fr/overview.tsx` and `StatusBadge`'s `label` not named |
| 9f | ronne-web checks | no | confirmed | lint, typecheck, 183 tests, build |
| 9g | `witness:check` | no | confirmed | exit 0 |

**Overall:** not met. Fixed after this round: 9b, 9c and 9e (ronne-web cfabd17, 2f42df9; this repository's SPEC). 9a is in the Done notes as a choice for 133's native reader.

### Re-check (rows 9b, 9c, 9e)

On the owner's decision (2026-10-23): the prose choices « revue » and "proposta de mudança" moved to 133 (Done notes), and the fixed rows are checked again.

Witnessed: 2026-10-23 16:59 EDT, by a fresh agent (blind). Commit: d3d12c8a (ronne-web 2f42df9). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 9b | No guide row contradicts another or the app | no | not met | Guide line 211 still says the page is headed "Requests to join" (app: Solicitações para entrar / Demandes pour se joindre) |
| 9c | The edited pages quote the app's labels | no | not met | `workspaces.tsx`: the catalogue's Workspace filter, "Personal" on the Workspaces list, "Already answered." |
| 9e | The SPEC describes the branch | no | confirmed | All 28 changed files named |
| W | `witness:check` | no | confirmed | exit 0 |
| R | ronne-web lint, typecheck, test | no | confirmed | 280 files; tsc exit 0; 183 passed (build not run in the copy) |

**Overall:** not met: rows 9b, 9c. Fixed in ronne-web 3f2095a; the round's probes (`strong-labels.mjs`, `english-labels.mjs`) then list only screens the app keeps English.
