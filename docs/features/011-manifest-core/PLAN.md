# 011 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. Dependencies and entry points.** Move `ajv`, `ajv-formats` and `yaml` to runtime
  dependencies, add `semver` and `fflate` (checklist in Notes), and set up the `.` and `./pack`
  exports. Move the schema to `packages/core/schema/`, and update the examples test and the links.
  *Done when:* `pnpm install --frozen-lockfile`, `pnpm licenses:check` and `pnpm audit` pass, and
  the examples test reads the moved schema.

- [ ] **2. Parsing and schema validation.** `parseManifest`, the safe YAML options, and Ajv errors
  turned into `ManifestIssue`s with pointers and line numbers.
  *Done when:* tests cover every example, one broken example per type, duplicate keys, aliases, a
  non-mapping document, oversized input, and the wording of the common errors.

- [ ] **3. Package checks.** Referenced files, `SKILL.md` frontmatter, paths, secret-looking
  literals, limits, semver ranges and dependency presence.
  *Done when:* a test per rule and per secret pattern passes, and every example package passes.

- [ ] **4. Packer and unpacker.** The ustar writer and reader, `packItem` and `unpackItem`.
  *Done when:* packing is byte-identical across runs, a round trip returns the same files, and
  hostile archives (built in the tests) are refused.

- [ ] **5. Use it from the web app.** Add `@ronneai/core` to `apps/web`, and a client component
  test that validates a manifest, so the browser entry point is proven before 012 needs it.
  *Done when:* `pnpm build` bundles it into a client component, and the test passes.

## Notes
