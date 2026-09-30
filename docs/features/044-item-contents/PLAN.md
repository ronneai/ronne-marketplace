# 044 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Reading an artifact.** `artifactFiles` in `server/domains/items/services/`: storage,
  sha256 check, `unpackItem`, sorted; the page gets text, or why not (binary, too large). 017's `versionFiles` uses it and still drops
  `version`. `versionContents` finds a published version (yanked included) behind `account.manage_own`,
  and a missing or mismatched artifact becomes `ArtifactUnavailableError`.
  *Done when:* `*.db.test.ts` covers the files matching the packed ones, `ronne.yaml` as released, a
  yanked version, a missing artifact, a checksum mismatch and an unchanged download count, and the
  proposal tests still pass.

- [x] **2. Canvas facts for everyone.** `dependencyFacts` in the items domain, from the catalogue's
  `byNames` and `factsOf`, behind `account.manage_own`.
  *Done when:* a db test covers a listed dependency, a missing one, a name that isn't one, and a
  signed-out visitor.

- [x] **3. Shared code and canvas.** Move `CodeEditor`, `languages.ts` and `FileTree` to
  `components/code/`, and the canvas pieces (`ComposerCanvas`, nodes, context, css, `toGraph`, layout)
  to `components/dependency-canvas/` (`graph.ts` holds `toGraph`; the YAML edits stay in the
  draft editor's `model.ts`). Given `hrefOf`, a dependency node links to its page.
  *Done when:* the draft editor and composer tests pass unchanged, and a test shows the node link.

- [x] **4. Overview model.** `bodyPathOf` and `settingsOf` in `features/item-page/overview/model.ts`.
  *Done when:* unit tests cover every example type, and no MCP header value appears.

- [ ] **5. Files viewer.** `FileContent` (Markdown rendered on the server with frontmatter and a
  Source toggle, highlighted text, binary and too-large notices) and `FilesBrowser` (tree, `?file=`,
  fallback).
  *Done when:* component tests cover each kind of file, the toggle and the fallback.

- [ ] **6. The tabs.** Overview first and the default, README at `?tab=readme`, the route loading the
  contents for Overview and Files only, the error notice, and the lazy canvas.
  *Done when:* `item-page.test.tsx` covers the tabs, `?file=` and the notice, and `catalogue.e2e.ts`
  covers an agent's prompt, Source, Files and the read-only canvas.

- [ ] **7. Documentation.** The `items#contents` section, the `contents` helper, and the note in
  `items#canvas`.
  *Done when:* the docs render tests pass, and every new helper's link lands on a real section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
