# 044 — See an item's contents on its page

> Milestone: M8 · Depends on: 018, 026, 031 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md)

## Goal

Anyone signed in can read what an item **is** before installing it: an agent's prompt with its tools
and model, a skill's `SKILL.md`, a rule's body and when it applies, a hook's command, an MCP server's
connection, and every other file in the version, exactly as `rmk install` would receive it. Today the
item page (018) lists file names and sizes only, so people install on trust. Transparency is the
point of a curated registry (owner, 2026-09-30).

## Scope

**In:**
- A new **Overview** tab on the item page, first and the default. It shows the type's settings, its main
  body file, and the dependencies on the read-only canvas (031).
- The **Files** tab becomes a file tree with a read-only viewer for every file of the shown version.
- Markdown is rendered by default, with a **Source** toggle that shows the exact text, frontmatter
  included.
- Reading a released version's artifact on the server, checked against its sha256, without counting a
  download.

**Out** (and where it goes instead):
- File contents through `/api/v1` or the MCP server. The tarball endpoint (019) already serves them, and
  an endpoint per file can come later if people ask for it.
- Downloading a single file, or the `.tgz`, from the web page (018 keeps it out).
- Drafts and submissions: the review page (014) already shows their files.
- Linking risk flags to the lines that raised them. The review page does it; the item page may add it later.

## Behaviour

**Tabs**, in order: Overview, README, Versions, Dependencies, Files, What it can do. Overview is the
page's default (`/items/@scope/name`), and README moves to `?tab=readme`. `?version=` works on every tab
as before.

**Overview** shows the shown version:
1. **Settings**, from the manifest's type block, as labelled rows:

   | Type | Rows |
   |---|---|
   | agent | Tools, Model |
   | skill | Entry file |
   | rule | Activation, Globs |
   | command | Arguments (name, required, description) |
   | output-style | none |
   | hook | Event, Matcher, Command (inline `run.command`) or Script, Timeout |
   | statusline | Script |
   | mcp-server | Transport, Command, Arguments, URL, Environment variables (name, required, secret), Headers (names only) |
   | permission-policy | Rules (tool, pattern, decision) |
   | lsp-server | Command, Arguments, Languages (id, extensions) |
   | bundle | none |

   A type with no rows shows no Settings panel. Header values and environment descriptions stay in
   `ronne.yaml`, which Files shows as released.
2. **The files**, as Files shows them (below): the tree on the left, with the body file open when the
   type has one: skill `skill.entry` (default `SKILL.md`), agent `agent.prompt`, rule `rule.body`,
   command `command.body`, output-style `output-style.body`, hook `run.script`, statusline
   `statusline.script`; otherwise `ronne.yaml`. `?file=` opens another. A path the manifest names but
   the version doesn't contain gets a notice.
3. **Dependencies**, when there are any: the read-only canvas. The item is in the centre, and each direct
   dependency is a node with its range, type, latest version and tools, joined to the centre. A node links to
   that item's page. Nothing can be moved, added or removed. It uses the default ring layout (released
   versions carry no `.ronne/layout.json`). For a bundle, the canvas is the main content.

**Files:** a file tree beside a viewer, stacked on narrow screens. The selected file is in `?file=`,
so it can be linked. Without `?file=`, or with a path the version doesn't have, it shows the body file,
else `ronne.yaml`. The viewer's header shows the path, the size and an "executable" badge.
- **Markdown** (`.md`): rendered safely, like the README (raw HTML off, `https:` images only), but
  keeping each line break, as prompts and rules are often written one instruction a line. YAML
  frontmatter is shown as a small table above it. A **Rendered / Source** toggle shows the exact text.
- **Other text:** read-only, with syntax highlighting chosen by the path (as in the draft editor).
- **Binary:** "Binary file, not shown", with its size.
- **Text over 512 KB:** "Too large to show here", with its size.

**Where the contents come from:** the version's `.tgz` in the `StorageAdapter`, checked against the
version's sha256 and unpacked with the packer's limits (011). `ronne.yaml` is shown as released,
`version` included. Reading doesn't count as a download. Yanked and deprecated versions can be read,
like the rest of their page. Only the Overview and Files tabs read the artifact.

**Who:** everyone signed in, like the rest of the page (the `account.manage_own` permission).

## Edge cases

- **The artifact is missing, or its checksum doesn't match:** Overview and Files show an error notice
  ("This version's files can't be read. Tell an administrator.") and the rest of the page works. It
  never shows unchecked bytes.
- **A dependency that is no longer in the catalogue:** its node shows the name and range, without facts.
- **An empty or whitespace-only body file:** the viewer says the file is empty.
- **A body path outside the files** (a manifest the schema accepted but the version lacks): a notice in
  place of the body. Settings and the canvas still show.
- **Markdown with unsafe HTML or `javascript:` links:** removed by the README renderer.
- **Frontmatter that isn't valid YAML:** no table. The rendered view shows the file after the
  frontmatter fence, and Source shows everything.

## Documentation

- **Topic `items`, new section `contents`, "Reading an item before you install it":** what Overview
  shows for each type, the Files viewer with Rendered and Source, the read-only canvas, and that the
  files are exactly what `rmk install` receives, checked against the version's sha256.
- **Inline helper `contents`** on the Overview and Files tabs: "What am I looking at?" This is the
  released version's files, as `rmk install` gets them. It links to `items#contents`.
- **Topic `items`, section `canvas`:** add that the item page shows the same canvas, read-only.

## Acceptance criteria

- [x] The item page opens on Overview. README, Dependencies, Files and What it can do are still reachable, with `?version=`.
- [x] Overview shows each example type's settings rows and body file (`examples/items/*`), and never an MCP header value.
- [x] Overview shows the read-only canvas for an item with dependencies, and each node links to the dependency's page.
- [x] Files shows a tree and the selected file's contents. `?file=` selects one, and an unknown path falls back to the body file.
- [x] Markdown is rendered with a working Source toggle, and frontmatter shows as a table.
- [x] Binary and very large files show a notice instead of their contents.
- [x] The contents match the released `.tgz`. A missing artifact or a checksum mismatch shows the error notice, and the download count doesn't change.
- [x] A yanked version's files can be read with `?version=`.
- [x] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

- Should the API and the MCP server expose single files later, so agents can read an item before
  installing it? Out for now (owner, 2026-09-30).
