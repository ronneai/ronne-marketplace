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

## Task 2 — The menu

Witnessed: 2026-10-09 09:47 EDT, by a fresh agent (blind). Commit: 4ae3d1b. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: DependencyField.tsx, dependency-picker.test.tsx, SPEC.md.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The `<Select>` renders the groups as `<optgroup>` (Compatible, then Exactly) | yes | confirmed | `DependencyField.tsx:102-110`; `vitest run …/dependency-picker` → 15 passed; swapping `<optgroup>` for a Fragment → 2 failed |
| 2 | Every option's label starts with the exact string it writes; no caret row shows a bare version | no | confirmed | Probe HTML: `<option value="^1.4.0" selected="">^1.4.0 · 1.4.0 or later 1.x, latest</option>`, `<option value="1.3.0">1.3.0 · exactly 1.3.0</option>`; `{choice.label}`→`{choice.range}` → 2 failed |
| 3 | The selected (closed) select shows the range and its words; one selected row | yes | confirmed | `dependency-picker.test.tsx:186` matches `selected=""` on `^1.4.0 · …`; `:201` asserts one `selected=""` |
| 4 | An Exactly row's value is the bare version, shown as chosen with its label | yes | confirmed | `:200` → `<option value="1.3.0" selected="">1.3.0 · exactly 1.3.0</option>`; `value={rangeFor(option, choice.range)}` → 2 failed |
| 5 | Choosing an option writes its value unchanged | yes | confirmed | `DependencyField.tsx:98` `onChange(event.target.value)`; a probe calling the mocked `Select`'s `onChange({target:{value:"1.3.0"}})` → `["1.3.0"]`; `:278` writes it to the row |
| 6 | The component tests cover choosing an exact version, which writes the bare version | yes | partly | They check the option's value, not the write: `onChange(rangeFor(option, event.target.value))` → all 15 still pass |
| 7 | A typed range in neither group stays at the top, labelled as itself | yes | confirmed | `:213` matches `^<select…><option value="~1.3.0" selected="">~1.3.0</option><optgroup`; dropping it → 1 failed; moving it below → 1 failed |
| 8 | A row with no version list says under it what its range accepts; nothing for a tilde | yes | confirmed | `DependencyField.tsx:135-143,287`; `:227-229` sees `^1.0.0</span> · 1.0.0 or later 1.x` and `2.1.0</span> · exactly 2.1.0`, nothing for `~1.2.0`; `{null}` → 1 failed |
| 9 | The frozen form shows that label (the same `DependencyField` in `<fieldset disabled>`) | yes | confirmed | `DraftEditor.tsx:654-668`; `ManifestForm.tsx:482-488` renders `DependencyField` the same in both states, so claim 8's test covers it (from the code) |
| 10 | No duplicates in the menu | no | confirmed | The top row only when `!known`; probe: each version once per group; one selected |
| 11 | Phone: the range always shows first and whole | no | partly | The select was `w-44` (about 140px of text); at 16px mono `1.0.0-rc.12345678` is 163px and gets cut |
| 12 | A screen reader gets the group name, then the range and its words | no | confirmed | Native `<optgroup label>` around `<option>` text that starts with the range (markup; no screen reader run) |
| 13 | The default pick is unchanged (`rangeFor`, latest's caret) | no | confirmed | `rangeFor` untouched; `DependencyField.tsx:181` and `DraftEditor.tsx:338` call `rangeFor(option)`; test `:24` → `^1.4.0` |
| 14 | The change lints and type-checks | no | confirmed | `biome check` → no fixes; `typecheck` → no errors |

**Overall:** not met: no component test covers the write of the bare version (6), and a long pre-release range was cut on a phone (11).

### Re-check — after the fixes for gaps 1–2

Witnessed: 2026-10-09 09:51 EDT, by a fresh agent (blind). Commit: 4ae3d1b. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: as above, plus range-input.test.tsx, e2e/pending-dependencies.e2e.ts, the SPEC.md phone edge case.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 15 | A component test captures the Select's onChange: choosing `1.3.0` writes `"1.3.0"`, `^1.3.0` writes `"^1.3.0"` | yes | confirmed | `range-input.test.tsx:10-16,46-49`; `vitest run …/dependency-picker` → 2 files, 16 passed |
| 16 | That test fails when the write is wrong | yes | confirmed | `onChange(rangeFor(option, event.target.value))` → 1 failed; `.replace("^","")` → 1 failed; unmutated → passed |
| 17 | On a phone the name takes its own line and the select the row's width; `sm:` restores one line | no | confirmed | Row `flex flex-wrap … sm:flex-nowrap`, name `basis-full … sm:basis-0`, select `min-w-0 flex-1 sm:w-64 sm:flex-none`. Real row markup with the built CSS (Plex Mono), Chromium and WebKit, touch: the select on its own line at 390 and 320px; at 768px one line, select 256px |
| 18 | `1.0.0-rc.12345678` fits whole at 390px and 320px | no | confirmed | 163px at 16px mono; text room 264–312px at 390px and 194–242px at 320px; fits in all 8 cases (2 engines × 2 widths × 16 or 32px padding, the padding estimated) |
| 19 | `pending-dependencies.e2e.ts`'s first option expects latest's caret with its words | no | confirmed | `toHaveText(/^latest \(/)` → `toHaveText(/^\^1\.\d+\.\d+ · .*, latest$/)` |
| 20 | `playwright test e2e/pending-dependencies.e2e.ts e2e/dependency-picker.mobile.e2e.ts` passes | no | confirmed | Build newer than the sources → 6 passed (chromium ×3, phone, phone-webkit, tablet) |

**Overall:** met: choosing a version is tested to write exactly its value, and on phones the version list takes the row's width, so a long pre-release range shows whole at 320px.

## Task 3 — End to end

Witnessed: 2026-10-09 10:08 EDT, by a fresh agent (blind). Commit: 03be8ad. Machine: macOS 27.0.1, Node v24.0.0. Working-tree diff: e2e/mobile.ts, e2e/users.ts, new e2e/version-pin.ts, version-pin.e2e.ts, version-pin.mobile.e2e.ts.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | A Playwright test picks the seeded dependency, chooses Exactly → 1.0.0, saves, and sees bare `1.0.0` in the YAML | yes | confirmed | `e2e/version-pin.ts:25-51`: searches `@e2e-seeded/versioned`, picks it, `selectOption("1.0.0")`; the YAML matches `"<dep>": "?1\.0\.0"?(?!\.)` and doesn't contain `^1.0.0`; Save → `Saved` |
| 2 | The test fails if the Exactly row writes the caret | no | confirmed | Scratch copy against the real build with `selectOption("^1.0.0")` → fails at `version-pin.ts:42`; with that line removed too → fails at `:46`, the YAML showing `"@e2e-seeded/versioned": ^1.0.0` |
| 3 | The form and YAML agree, and the saved value persists | no | confirmed | `version-pin.ts:54-56`: after reload, the Form's `Range of <dep>` has value `1.0.0`; passed in every project |
| 4 | The selected row shows its range and words (latest's caret by default, then the exact row) | yes | confirmed | `version-pin.ts:33-42`: checked option `^${latest} · ${latest} or later 1.x, latest`, then `1.0.0 · exactly 1.0.0`; accepts latest 1.0.0 or 1.1.0, so versions.e2e.ts's yank doesn't matter |
| 5 | A row opened again later, with no version list, says what its range accepts | yes | confirmed | `version-pin.ts:53-57`: after reload `1.0.0 · exactly 1.0.0` is visible and nothing scrolls sideways, in all 4 projects (a page-wide text match) |
| 6 | It runs on desktop and phone, with its own users, clear of the sign-in limit | yes | confirmed | `playwright test e2e/version-pin.e2e.ts e2e/version-pin.mobile.e2e.ts` → 4 passed (chromium, phone, phone-webkit, tablet); users `version-pin-*@e2e.test` in `users.ts`, per project in `mobile.ts`, seeded by the `E2E_USERS` loop (`seed.ts:42`) |
| 7 | The full end-to-end suite passes | yes | confirmed | `npx playwright test` → 114 passed (2.9m), on a build newer than every source (`find src -newer .next/BUILD_ID` → none); Biome on the 5 e2e files clean; `tsc --noEmit` clean |

**Overall:** met: the exact-pin test passes on desktop, phone, phone-webkit and tablet, the full suite is green, and the test fails when the Exactly row writes a caret.
