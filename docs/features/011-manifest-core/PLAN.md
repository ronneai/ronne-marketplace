# 011 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Dependencies and entry points.** Move `ajv`, `ajv-formats` and `yaml` to runtime
  dependencies, add `semver` and `fflate` (checklist in Notes), and set up the `.` and `./pack`
  exports. Move the schema to `packages/core/schema/`, and update the examples test and the links.
  *Done when:* `pnpm install --frozen-lockfile`, `pnpm licenses:check` and `pnpm audit` pass, and
  the examples test reads the moved schema.

- [x] **2. Parsing and schema validation.** `parseManifest`, the safe YAML options, and Ajv errors
  turned into `ManifestIssue`s with pointers and line numbers.
  *Done when:* tests cover every example, one broken example per type, duplicate keys, aliases, a
  non-mapping document, oversized input, and the wording of the common errors.

- [x] **3. Package checks.** Referenced files, `SKILL.md` frontmatter, paths, secret-looking
  literals, limits, semver ranges and dependency presence.
  *Done when:* a test per rule and per secret pattern passes, and every example package passes.

- [ ] **4. Packer and unpacker.** The ustar writer and reader, `packItem` and `unpackItem`.
  *Done when:* packing is byte-identical across runs, a round trip returns the same files, and
  hostile archives (built in the tests) are refused.

- [ ] **5. Use it from the web app.** Add `@ronneai/core` to `apps/web`, and a client component
  test that validates a manifest, so the browser entry point is proven before 012 needs it.
  *Done when:* `pnpm build` bundles it into a client component, and the test passes.

## Notes
- **Task 1 (2026-09-27): dependencies and entry points.**
  - **The dependency checklist** (policy §3):

    | Package | Version | Licence | Released | Install scripts | Its dependencies |
    |---|---|---|---|---|---|
    | `ajv` | 8.20.0 | MIT | 2026-04-24 | none | 4, all already installed |
    | `ajv-formats` | 3.0.1 | MIT | 2024-03-30 | none | `ajv` |
    | `yaml` | 2.9.1 | ISC | 2026-09-11 | none | none |
    | `semver` | 7.8.5 | ISC | 2026-06-19 | none | none |
    | `fflate` | 0.8.3 | MIT | 2026-05-16 | none | none |
    | `@types/semver` (dev) | 7.8.0 | MIT | 2026-08-02 | none | none |

    All are maintained, widely used libraries with no open advisories. `ajv`, `ajv-formats` and
    `yaml` moved from dev to runtime dependencies. `pnpm licenses:check` and `pnpm audit` pass.
    (`fflate` also published a 0.7.5 backport after 0.8.3; 0.8.3 is the newest.)
  - **The schema** moved (`git mv`, so its history follows) to `packages/core/src/schema/ronne.schema.json`.
    - `src/schema/index.ts` imports it as JSON (`with { type: "json" }`, with `resolveJsonModule`),
      so the build copies it into `dist/schema/`.
    - It's exported as `manifestSchema`, and as `@ronneai/core/schema.json` for editors.
    - Links in MVP.md, the manifest spec, `examples/items/README.md` and CLAUDE.md point there now.
  - **Entry points:** `.`, `./pack` (the `PackageFile` type for now; task 4 adds the packer) and
    `./schema.json`. Checked by importing each from the built package.
- **Task 2 (2026-09-27): `parseManifest`** (`src/manifest.ts`), with `ManifestIssue`, `hasErrors`
  and `fieldName` (`src/issues.ts`).
  - **YAML** (`yaml`, core schema) with unique keys and a `LineCounter`.
    - **Anchors and aliases** are found with a visitor and refused, and `toJS({ maxAliasCount: 0 })`
      guards again.
    - **Refused:** input over 64 KB before parsing, and anything but a mapping at the top.
    - **YAML errors** keep their line numbers.
  - **Schema errors** come from Ajv (2020-12, `allErrors`, compiled once, on first use), each turned
    into one sentence with its JSON pointer and the line of its YAML node, or of the nearest existing
    parent for a missing field.
  - **Noise removed:**
    - `if` and `allOf` wrapper errors;
    - when `type` is missing or unknown, the 10 `if`/`then` "… is required" errors (only the type
      error shows);
    - a dependency key's pattern error, which repeats the `propertyNames` error that names the key.
  - **The manifest comes back whenever it's a mapping,** even an invalid one, so package checks can
    still run.
  - **The skill block is optional** (its `entry` defaults to `SKILL.md`), so the per-type test breaks
    skills with an escaping `entry` path instead of removing the block.
- **Task 3 (2026-09-27): `checkPackage`** (`src/package-checks.ts`), with `DEFAULT_LIMITS` and
  `formatBytes` (`src/limits.ts`).
  - **Files the manifest names:** each type's path field (`skill.entry` defaults to `SKILL.md`),
    `files[]`, and a named file that `files` leaves out (it wouldn't be packed). A missing `readme`
    isn't an error. The issue carries the manifest pointer, so the editor can link to it.
  - **`SKILL.md`:** YAML frontmatter (aliases off) with a description, and a name equal to the
    item's name without its scope.
  - **Paths:** `pathProblem()` refuses empty paths, over 255 characters, control characters, `\`,
    a leading `/`, `..`, and empty or `.` segments. Two paths differing only in case are refused.
  - **Limits:** 500 files, 1 MB a file and 20 MB in all, where `.ronne/` doesn't count. (5 MB packed
    is the packer's check, in task 4.)
  - **Secrets:** `secretLike()` returns `{ kind, certain }`. Known formats are errors; long random
    strings are warnings (spec updated, because a commit hash would otherwise block submitting).
  - **Dependencies:** only bundles, agents, skills and commands may have them; ranges must pass
    `semver.validRange` (so `latest` fails); an item can't depend on itself.
  - **Tests:** every example package passes (read from its folder), with a test per rule and per
    secret format, the ordinary values that mustn't match, and the limits with small custom values.

