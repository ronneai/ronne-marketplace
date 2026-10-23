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
