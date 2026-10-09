# #143 — Witness

> Plan: [PLAN.md](./PLAN.md) · Spec: [SPEC.md](./SPEC.md)

Before a task is ticked, the `state-witness` agent, which didn't do the work, checks it against the
real state, blind to the notes first. A `[risky]` task also gets an adversarial pass. A task is
ticked only when its latest pass is met with every claim confirmed. The record lands here, in the
same commit as the task. How it works: [state-witness.md](../../knowledge/state-witness.md).

## Task 1 — The model

Witnessed: 2026-10-09 09:37 EDT, by a fresh agent (blind). Commit: 767362b. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: model.ts, dependency-picker.test.tsx, DependencyField.tsx.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `acceptsText(range)` exists and gives the spec's words for `^1.2.3`, `^0.2.3`, `^0.0.3`, `1.2.3` and `1.2.3-beta.1`, with unit tests | yes | confirmed | `model.ts:21-32`; test "says what a range accepts (#143)" asserts all five, plus null for `~1.2.3`, `>=1.0.0`, `^1.2.3-beta.1`, `^1.2`, `""` and `latest`; `vitest run src/features/draft-editor/dependency-picker` → 10 passed |
| 2 | The words match real semver caret semantics | no | confirmed | `semver.satisfies` probe: `^1.2.3` takes 1.9.0 not 2.0.0; `^0.2.3` takes 0.2.9 not 0.3.0; `^0.0.3` only 0.0.3; `1.2.3-beta.1` only itself; `^0.0.0` → "only 0.0.0", also right |
| 3 | `versionChoices` returns **Compatible** (latest's caret first, then the others newest first) and **Exactly** (each released version newest first) | yes | confirmed | `model.ts:48-69`; the test expects `[Compatible: ^1.4.0, ^1.3.0][Exactly: 1.4.0, 1.3.0, 2.0.0-beta.1]`; `option.versions` is sorted by `publishedAt` desc (`dependency-search.ts:103`) |
| 4 | Rows have the shape `{ label, range, accepts }` (Behaviour) | no | partly | `VersionChoice = { label; range }`: the words are only inside `label` (`model.ts:38-41`) |
| 5 | Every label starts with the exact string the row writes | yes | confirmed | `choice()` builds `label` from `range`; every expected label in the tests starts with its range |
| 6 | A pre-release appears only under **Exactly** | yes | partly | Holds when `latest` is stable (mutation → 1 test fails). Probe `versionChoices({versions:["1.0.0-beta.1"], latest:"1.0.0-beta.1"})` → Compatible `1.0.0-beta.1 · exactly 1.0.0-beta.1, latest`, and again in Exactly; the listed version can be a pre-release (`items/models/catalogue.ts:21`) |
| 7 | An unreleased item offers `^1.0.0` (first release or a later 1.x) and `1.0.0` (exactly its first release) | yes | confirmed | `model.ts:49-53`; test "offers an unreleased item its first release…" |
| 8 | No duplicates: a single release gives one row per group, each version once per group | yes | confirmed | Test "lists a single release once in each group" → `[["^1.0.0"],["1.0.0"]]` and a Set check; removing the dedup → 3 tests fail |
| 9 | A yanked version isn't offered in either group | no | confirmed | `dependency-search.ts:101-102` filters `!v.yanked`; the model reads only `option.versions` and `option.latest`; a yanked `latest` moves the tag (`items/services/versions.ts:185-190`) |
| 10 | `rangeFor` is unchanged | yes | confirmed | `git diff -U0 model.ts`: the first hunk starts below `rangeFor`; its only `rangeFor` lines are calls |
| 11 | The model tests cover caret, 0.x, 0.0.x, pre-release, unreleased, a single release and no duplicates, and fail when the code breaks | yes | confirmed | Scratch mutations: no dedup → 3 fail; pre-release carets let in → 1; `^0.0.x` worded wrongly → 2; 0.x read as major → 2 |
| 12 | `DependencyField.tsx` consumes the new shape (flattened); type-checks and lints | no | confirmed | `versionChoices(option).flatMap((group) => group.choices)`; `typecheck` → no errors; `biome check` → no fixes |

**Overall:** not met: rows have no separate `accepts` field (4), and a pre-release listed version lands in Compatible (6). Also: `acceptsText` gives words for strings semver rejects (`01.2.3`, `1.2.3-.`).

### Re-check — after the fixes for bugs 1–3

Witnessed: 2026-10-09 09:42 EDT, by a fresh agent (blind). Commit: 767362b. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: model.ts, dependency-picker.test.tsx, DependencyField.tsx, SPEC.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 13 | Bug 1: with only pre-releases out, the listed pre-release stays out of Compatible and nothing is duplicated | no | confirmed | Probe `{versions:["1.0.0-beta.1"], latest:"1.0.0-beta.1"}` → `[["Exactly",["1.0.0-beta.1"]]]`; with `0.9.0` too → Compatible `["^0.9.0"]` (not marked latest) |
| 14 | Bug 2: each row carries `accepts`, and `label` is `` `${range} · ${accepts}` `` | no | confirmed | `VersionChoice = { label; range; accepts }`; probe over 6 options → every row `label === range + " · " + accepts`; tests `toEqual` rows with `accepts` |
| 15 | Bug 3: `acceptsText` returns null for `01.2.3` and `1.2.3-.` | no | confirmed | Probe → null for both, and for `1.02.3`, `1.2.3-beta..1`, `1.2.3-beta.`, `^01.2.3`, matching `semver.valid` |
| 16 | Updated spec: `acceptsText` is null for any string that isn't a semver version | no | partly | `acceptsText("1.2.3-01")` → "exactly 1.2.3-01", but `semver.valid("1.2.3-01")` → null (a numeric pre-release part with a leading zero) |
| 17 | Claim 4 against the updated SPEC.md | no | confirmed | Behaviour defines `label` as `` `${range} · ${accepts}` ``; Scope says a row is one mono font in a native select; the code matches (14) |
| 18 | Claim 6 against the updated SPEC.md | no | confirmed | `groups.filter((group) => group.choices.length > 0)`; probe (13) shows Compatible left out; the test also checks `rangeFor`'s default is still offered |
| 19 | The tests catch regressions of the fixes | yes | confirmed | Mutations: pre-release into Compatible → 1 fails; empty group kept → 1; dedup removed → 3; `accepts: ""` → 3; old `(\d+)` → 1; old pre-release part → 1 |
| 20 | No regressions; lint and typecheck pass | no | confirmed | `vitest run …/dependency-picker` → 11 passed; `biome check` → no fixes; `typecheck` → exit 0 |

**Overall:** not met: bugs 1–3 are closed and claims 4 and 6 hold against the updated spec, but `acceptsText("1.2.3-01")` still gives words (16).

### Re-check — claim 16

Witnessed: 2026-10-09 09:44 EDT, by a fresh agent (blind). Commit: 767362b. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: model.ts, dependency-picker.test.tsx, DependencyField.tsx, SPEC.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 21 | `acceptsText` has words exactly when `semver.valid` accepts the string | no | confirmed | Scratch fuzz comparing `acceptsText(s) !== null` with `semver.valid(s) === s`: 32 listed strings (`1.2.3-01`, `1.2.3-beta.007`, `1.2.3-0a`, `1.2.3--`, `01.2.3`, `1.2.3+b`, `v1.2.3`, …) → 0 mismatches; 200,000 random strings → 0 |
| 22 | The test catches reverting the pre-release part | no | confirmed | Reverting `PART` to `[0-9A-Za-z-]+` → "says what a range accepts" fails on `1.2.3-01`; `\d+` → the same |
| 23 | The pattern has no polynomial backtracking (`docs/knowledge/codeql-regex.md`) | no | confirmed | Anchored `^…$`; parts split on `.`, which no part matches. `"1.2.3-" + unit×n + "!"`: n=100k → 0.6–1.0 ms, n=1M → 3.3–10.5 ms (linear). CodeQL itself runs only in CI |
| 24 | No regressions; lint and typecheck pass | no | confirmed | `vitest run …/dependency-picker` → 11 passed; `biome check` → no fixes; `typecheck` → exit 0 |

**Overall:** met: `acceptsText` agrees with `semver.valid` on every listed and fuzzed string, the test fails when the part is reverted, and the pattern is linear on adversarial input.
