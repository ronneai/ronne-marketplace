# #143 — The dependency menu shows the range it writes, and offers an exact pin

> GitHub: [#143](https://github.com/ronneai/ronne-marketplace/issues/143) · Feature: [089](../../features/089-dependency-picker-rule/SPEC.md) (the picker of [056](../../features/056-pending-dependencies/SPEC.md)) · Reported on: 0.3.2

## Report

- In the manifest form's dependency menu, the row labelled `1.0.0` writes `^1.0.0`, and
  `latest (1.1.0)` writes `^1.1.0`.
- The YAML and the frozen form show the caret. The menu doesn't.
- An exact `1.0.0` typed in the YAML is accepted, so a pin is allowed, but the menu doesn't offer
  one.
- The author read `1.0.0` as a pin. The file accepts `1.1.0` and later, which is what install
  resolves, and it's what turned a later link back to the same item into a cycle (see
  [#141](../141-resolver-backtracking/SPEC.md)).

The cause: `versionChoices` in `apps/web/src/features/draft-editor/dependency-picker/model.ts`
uses the bare version as the label and `startingRange(version)` (`composer-canvas/model.ts`, a
caret except for a pre-release) as the value.

## Goal

Every row in the menu says what will be written to `ronne.yaml`, and what that accepts. The
author can choose between "this version or a compatible later one" and "exactly this version".

## Scope

**In:**
- **The labels.** Each row shows the range it writes, then what it accepts in words (the menu is a
  native `<select>`, so a row is one font: mono, as today):
  - `^1.1.0` · 1.1.0 or later 1.x, latest
  - `^1.0.0` · 1.0.0 or later 1.x
  - `1.0.0` · exactly 1.0.0
- **Exact pins.** The menu has two groups (`<optgroup>`):
  - **Compatible** (the caret ranges, as today, with `latest` first);
  - **Exactly** (each released version, newest first).
- **What caret means for 0.x and pre-releases:**
  - `^0.2.3` reads "0.2.3 or later 0.2.x";
  - `^0.0.3` reads "only 0.0.3";
  - a pre-release, which `startingRange` already writes exactly, appears only under **Exactly**,
    even when it's the version the list names (an item whose only releases are pre-releases).
    **Compatible** is then left out, having nothing to offer.
- **An unreleased item** (056) offers `^1.0.0` (its first release, or a later 1.x) and `1.0.0`
  (exactly its first release).
- **A range typed in the YAML** that's in neither group stays at the top as today, labelled with
  the range itself.

**Out:**
- **The default.** A new pick still starts on the latest's caret range (`rangeFor`), as today,
  and `@` in markdown still writes it (`DraftEditor.tsx` → `addDependency`).
- **Tilde or other ranges in the menu.** They can still be typed in the YAML.
- **Checking cycles or conflicts at pick time.** That's [#142](../142-submit-problems-on-save/SPEC.md)
  (at save) and [#141](../141-resolver-backtracking/SPEC.md) (at install).

## Behaviour

- **`versionChoices(option)`** returns groups of `{ label, range, accepts }`, where `label` is
  `` `${range} · ${accepts}` ``.
  - The words come from one function, `acceptsText(range)`, unit-tested on `^1.2.3`, `^0.2.3`,
    `^0.0.3`, `1.2.3` and `1.2.3-beta.1`. It has no words (`null`) for anything else: a tilde, a
    caret on a pre-release, or a string that isn't a semver version.
- **The selected row** shows its range, so the closed select reads `^1.0.0 · 1.0.0 or later 1.x`
  and never a bare `1.0.0` for a caret.
- **The frozen (read-only) form** shows the same label as the open menu.
- **No duplicates.** When `latest` is the only released version, **Compatible** has one row,
  `^1.0.0 · …, latest`. Every released version appears once in each group.

## Edge cases

- **A yanked version** isn't offered, as today (`option.versions`), in either group.
- **A narrow phone screen.** The label may wrap or be cut after the range. The range always
  shows first and whole.
- **A screen reader** reads the group name, then the range and its words.

## Documentation

- **Items and types → Dependencies** (`items#dependencies`), on the website, in en, pt and fr.
  The picker offers a compatible range (caret, the default) or an exact version, and says what
  each accepts. One sentence on why a pin can matter (an exact version never moves).
- **Helpers:** on the dependency field, "Compatible or exact?" → `items#dependencies`, beside
  the existing ones in `apps/web/src/components/help/Help.tsx`.

## Acceptance criteria

- [ ] No row shows a bare version for a caret range. Every row's label starts with the exact
  string it writes.
- [ ] Choosing a row in **Exactly** writes the bare version to `ronne.yaml`, and the form and YAML
  agree.
- [ ] 0.x and pre-release versions read correctly (unit tests).
- [ ] An unreleased dependency offers `^1.0.0` and `1.0.0`.
- [ ] Component tests cover the groups, the selected label and the frozen form. An end-to-end
  test picks an exact version on desktop and phone.
- [ ] The Documentation and helper above say so, in English, Portuguese and French.

## Decisions

1. **Show the range and offer an exact pin** (owner, 2026-10-08).
2. **Caret stays the default** (Claude). Today's files and the "newest compatible" rule
   (MVP §4.3) don't change. Pinning is a choice the author makes.

## Open questions

None.
