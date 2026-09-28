# 011 — Manifest core

> Milestone: M2 · Depends on: 001 · Design: [MVP §3.2](../../MVP/MVP.md#32-canonical-manifest--ronneyaml), [§4.2](../../MVP/MVP.md#42-release), [§12](../../MVP/MVP.md#12-security-considerations) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md), [`ronne.schema.json`](../../../packages/core/src/schema/ronne.schema.json)

## Goal

One implementation of "is this a valid item?" and "turn it into a package", shared by the web app
(012, 013, 015), `rmk` (022) and the MCP server (027). The editor checks drafts with it as you type,
the server checks them again on submit, and the release packs them with it.

## Scope

**In** (all in `packages/core`):
- **The schema moves here.** `packages/core/src/schema/ronne.schema.json` becomes the only copy (published as `@ronneai/core/schema.json`), and
  `docs/spec/manifest.md` links to it. The examples test reads it from there.
- **Parsing and schema validation** of `ronne.yaml`, with readable issues.
- **Package checks** (manifest spec §6, layer 2): referenced files, `SKILL.md` frontmatter, paths,
  secret-looking literals, and the upload limits.
- **Semver range checks** for `dependencies`, and the dependency-type rules (manifest spec §3).
- **The packer:** a deterministic `.tgz` and its sha256, and the matching **unpacker** with the
  path-traversal, symlink and size checks.
- The name rules from 010 are reused for item names.

**Out:**
- Registry checks (the scope exists, dependencies are published, no cycles) → 013, on the server.
- Risk flags → 014, which computes them from the same manifest and files.
- The resolver → 019. Renderers → 020 onward.
- Storing packages → 015 (`StorageAdapter`).

## Behaviour

**Entry points.** Everything but packing runs in the browser and in Node, so 012 can validate
without a round trip.
- `@ronneai/core`: names, item types, parsing, validation and package checks.
- `@ronneai/core/pack`: `packItem` and `unpackItem`. They work on bytes, and run anywhere `fflate`
  does.

**Files as data.** Checks and the packer take a list of `PackageFile`, never the file system, so
the web app (draft files from the database, 012), the CLI (a folder) and tests all use them the
same way:

```ts
type PackageFile = { path: string; bytes: Uint8Array; executable?: boolean };
```

**Issues.** Every check returns a list; nothing throws for invalid content.

```ts
type ManifestIssue = {
  severity: "error" | "warning";
  code: string;          // stable, e.g. "file_missing", "schema", "range_invalid"
  message: string;       // one plain sentence, e.g. "prompt.md is listed in agent.prompt but doesn't exist"
  path?: string;         // JSON pointer into the manifest, e.g. "/agent/prompt"
  file?: string;         // the file it's about, when it isn't ronne.yaml
  line?: number;         // 1-based line in ronne.yaml, when the path can be located
};
```

**`parseManifest(text)`:** parses YAML 1.2 (`yaml`), rejects duplicate keys, anchors and aliases
(no billion-laughs expansion), and anything but a mapping at the top. Then it validates against the
schema with Ajv (JSON Schema 2020-12, `allErrors`). Ajv's errors are turned into one sentence each,
with the YAML line of the offending node.

**`checkPackage(manifest, files, limits?)`:**
- **Files the manifest names exist:** `files[]`, `readme`, and each type block's path fields
  (`agent.prompt`, `rule.body`, `command.body`, `output-style.body`, `skill.entry`, `hook.run.script`,
  `statusline.script`).
- **`SKILL.md` frontmatter:** it has `name` and `description`, and `name` equals the item's name
  without its scope.
- **Paths:** relative, `/` only, no `..`, no leading `/`, no backslash, no control characters,
  at most 255 characters, and unique once case is ignored. `.ronne/` is never packed.
- **Secret-looking literals:** in `mcp-server.env`, `headers` and `args`, a literal that matches a
  known token pattern is an error: `ghp_`, `github_pat_`, `sk-`, `xox[bp]-`, `AKIA…`, `rmk_`, JWTs,
  and high-entropy strings over 32 characters. Values must reference variables (`${NAME}`).
- **Limits** (MVP §12): 500 files, 1 MB a file, 20 MB unpacked, and 5 MB packed (checked by the
  packer). The defaults are exported; root will be able to change them in instance settings later.
- **Dependencies:** each range is a valid semver range (`semver`), dist-tags aren't allowed, and
  the item's type may have dependencies of any kind at all (manifest spec §3). Whether the target
  types are allowed needs the registry, so that's 013.

**`packItem(manifest, files, { version })`:**
- Writes `ronne.yaml` with `version` filled in, then every file, under a `package/` folder (as npm does).
- **Deterministic:** entries sorted by path, mtime 0, uid and gid 0, mode `0644` (or `0755` when
  `executable`), a gzip header with no name or time. The same content always gives the same bytes
  and the same sha256, which 015 relies on for immutability, and which makes tests exact.
- Uses a small ustar writer in `packages/core` (a few dozen lines) and `fflate` for gzip.
- Returns `{ tgz, sha256, size }`, and fails with `package_too_large` over 5 MB.

**`unpackItem(tgz, limits?)`:** the inverse, for `rmk` and for tests. It refuses symlinks, hard
links, devices, paths outside `package/`, and anything over the limits, before writing anything.

**Dependencies** (each through the [dependency policy](../../policies/dependencies.md) checklist):
`ajv` and `ajv-formats` (MIT) and `yaml` (ISC) move from dev to runtime dependencies; `semver`
(ISC) and `fflate` (MIT, no dependencies) are added.

## Edge cases

- **Huge or hostile YAML:** input over 64 KB is refused before parsing; aliases are off, so a small
  file can't expand.
- **A manifest that isn't valid** still gets package checks where possible (for example, missing
  files), so the editor shows every problem at once.
- **Non-UTF-8 text files:** allowed as bytes. Only `ronne.yaml` and `SKILL.md` must be UTF-8.
- **Windows line endings** in `ronne.yaml` are accepted; the packer writes the manifest back with `\n`.
- **Reproducibility across versions of `fflate`:** the sha256 is taken over the bytes produced, and
  stored with the version (015), so a future change in compression never breaks a published package.

## Acceptance criteria

- [ ] The schema lives only in `packages/core`, and every example in `examples/items/` passes it.
- [ ] `parseManifest` reports schema errors as one sentence each with a JSON pointer and a line number, and refuses aliases and duplicate keys.
- [ ] `checkPackage` catches each rule above, with a test per rule, including every secret pattern.
- [ ] `packItem` is deterministic: packing the same files twice gives identical bytes and sha256, and entry order, times and modes are as specified.
- [ ] `unpackItem(packItem(x))` gives back `x`, and hostile archives (traversal, symlinks, too big) are refused.
- [ ] The validation entry point builds and runs in the browser (a render test in the web app imports it).
- [ ] New and moved dependencies pass the checklist, `pnpm licenses:check` and `pnpm audit`.

## Open questions

- None.
