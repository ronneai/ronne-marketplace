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
