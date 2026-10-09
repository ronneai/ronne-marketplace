# #143 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. The model.** In `dependency-picker/model.ts`:
  - `acceptsText(range)`;
  - `versionChoices` returns the **Compatible** and **Exactly** groups, with labels that start
    with the range;
  - the unreleased item's two rows.

  `rangeFor` is unchanged. *Done when:* the model tests cover caret, 0.x, 0.0.x, pre-release,
  unreleased, a single release, and no duplicates.

- [ ] **2. The menu.** In `DependencyField.tsx`:
  - the `<Select>` renders the groups as `<optgroup>`;
  - the selected and frozen labels;
  - a typed range kept at the top.

  *Done when:* the component tests cover choosing an exact version, which writes the bare
  version, and the frozen form's label.

- [ ] **3. End to end.** A Playwright test picks a dependency, chooses **Exactly → 1.0.0**, saves,
  and sees `1.0.0` in the YAML. *Done when:* `pnpm test:e2e` passes on desktop and phone.

- [ ] **4. Documentation and helper.**
  - `items#dependencies` on the website (en, pt, fr), in a ronne-web branch that goes live with
    the release.
  - The "Compatible or exact?" helper in `components/help/Help.tsx`.

  *Done when:* both say what tasks 1–2 do.
