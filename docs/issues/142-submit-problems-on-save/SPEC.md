# #142 — Saving shows the problems Submit would refuse

> GitHub: [#142](https://github.com/ronneai/ronne-marketplace/issues/142) · Feature: [013](../../features/013-submit-withdraw/SPEC.md) (with [011](../../features/011-manifest-core/SPEC.md), [056](../../features/056-pending-dependencies/SPEC.md)) · Reported on: 0.3.2

## Report

- A draft with a dependency range that has no published match, `^9.0.0`, saves with the problems
  button on **No problems**. Submit then refuses it: no published version matches that range.
- A dependency cycle does the same: the draft saves clean, and Submit says the dependencies go
  round in a circle.
- The author finds out only at Submit, when the confirm button is disabled.

The cause:
- The editor's problems (`DraftEditor.tsx`, the `issues` memo) are 011's offline checks only:
  `validateDraft`, run in the browser as the author types, and again by the server on save
  (`saveDraftFiles` returns only `validateDraft`, `services/drafts.ts`).
- The registry checks Submit runs (`registryIssues` → `nameIssues`, `typeIssues`,
  `dependencyIssues`, `frontmatterAgentIssues`, in `services/registry-checks.ts`) run only at
  Submit, and on an API upload (`uploaded()`, which already returns them as `submitIssues`).

## Goal

After a save, the problems badge and list show what Submit would refuse, with the same words as
Submit. The author can fix a blocked draft while editing.

## Scope

**In:**
- **`saveDraftFiles` also returns `submitIssues`**, from `registryIssues` on the saved draft.
  Upload already returns them (the `uploaded()` path), and a change proposal also gets
  `noChangeIssues`.
- **`saveDraftAction` passes them on.** The editor shows them next to 011's problems: in the
  badge (`IssuesSummary`), in the problems list, and under `ronne.yaml` in the file tree. Each
  appears once, even when a check exists on both sides.
- **They hold until the next save.** While the files differ from what was saved, the registry
  problems stay listed, marked "as of your last save". Typing doesn't re-query the registry.
- **The draft page's first load** also shows them, so a draft opened later shows its blockers
  without a save.

**Out:**
- **Live registry checks while typing.** Each one is several queries, and save is the moment
  the author expects a check.
- **Changing what Submit checks, or its wording.** This shows the same issues sooner.
- **The composer canvas (`composer.ts`)**, which already marks dependencies through
  `dependencyIssues`.

## Behaviour

- **Save:** after a successful save, the editor's problems are 011's checks on the current text
  plus the registry's checks on the saved draft. An error from either counts in the badge, for
  example "1 error".
- **The words are Submit's own:**
  - "No published version of @scope/b matches ^9.0.0."
  - "The dependencies go round in a circle: …"
  - The name-taken message, and so on.

  Each issue links to `/dependencies` (or its path) as at Submit.
- **Warnings stay warnings.** `dependency_pending` and `dependency_range_pending` (056) show as
  warnings and don't block Submit, as today.
- **Submit's dialog doesn't change.** It still runs the checks itself, since the registry may have
  changed since the save.
- **Only 011's errors hold the Submit button**, as today. The registry's are advice from the last
  save: Submit opens its dialog, checks again, and refuses there in the same words. A dependency
  released since the save doesn't need another save to submit.
- **When the registry checks fail to run** (a database error), the save still succeeds. The
  editor shows 011's problems and says the registry checks couldn't run.

## Edge cases

- **A draft with no `ronne.yaml`, or one that doesn't parse.** The registry checks find no
  dependencies (today's rule) and only the name check runs. 011 already reports the parse error.
- **A dependency released after the save.** The badge clears at the next save or page load.
  Submit sees the release.
- **A proposal (017) that changes nothing.** `noChangeIssues` shows after the save, as on upload.
- **Two tabs saving the same draft.** Each shows the registry problems of its own last save.

## Documentation

- **Items and types → Building in the canvas** (`items#canvas`) and **Review → Checks**
  (`review#checks`), on the website, in en, pt and fr. Problems show the registry's checks (name,
  dependencies, cycles) after each save, not only at Submit.
- **Helpers:** none new. The problems popover's text says "as of your last save" next to the
  registry problems.

## Acceptance criteria

- [ ] Saving a draft whose dependency is `^9.0.0` (no match) shows Submit's error in the badge and
  the list.
- [ ] Saving a draft that closes a cycle shows Submit's cycle error.
- [ ] A clean draft still shows **No problems**.
- [ ] Opening a blocked draft shows the problem before any save.
- [ ] The registry problems stay, marked "as of your last save", while editing, and are
  re-checked on the next save.
- [ ] A failure in the registry checks doesn't fail the save.
- [ ] Service db tests pass on the four databases. An end-to-end test covers the `^9.0.0` case on
  desktop and phone.
- [ ] The Documentation listed above says so, in English, Portuguese and French.

## Decisions

1. **Checked on save and on load, not while typing** (Claude). It matches when the author
   expects a check, and keeps the registry queries to one round per save.
2. **The same function as Submit** (Claude). `registryIssues` is reused, so the editor and Submit
   can't drift apart.
3. **The registry's problems don't hold the Submit button** (Claude, 2026-10-08, found by the
   end-to-end run in task 4). They may be out of date, and Submit's dialog checks them again.

## Open questions

None.
