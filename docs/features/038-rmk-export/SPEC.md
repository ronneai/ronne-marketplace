# 038 — `rmk export` for skills

> Milestone: M7 · Depends on: 037, 011, 022 · Design: [MVP §6](../../MVP/MVP.md#6-cli--rmk), [§3.2](../../MVP/MVP.md#32-canonical-manifest--ronneyaml), [§12](../../MVP/MVP.md#12-security-considerations) · Contracts: [`docs/spec/native-readers.md`](../../spec/native-readers.md), [`docs/spec/manifest.md`](../../spec/manifest.md), [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

A person who wrote a skill in their AI tool's folder sends it to the marketplace with one command:
`rmk export` reads the folder, writes the `ronne.yaml` it lacks, shows exactly what will be
uploaded, and creates a draft (037) that the person reviews and submits in the web app. Skills come
first because a skill's folder already is the item (manifest spec §2); the other types follow in
040, and the MCP tools in 039 run this same code.

## Scope

**In:**
- `rmk export` for **skills** in `.claude/skills/` and `.agents/skills/`, in the project or the
  home folder, or any folder with a `SKILL.md`.
- A **reader** in `packages/core`: a skill folder's files in, a manifest and the files to upload
  out. It is the reverse of a renderer and, like one, touches no disk.
- Telling what the person wrote from what `rmk` installed.
- Choosing the marketplace scope, the preview, the confirmation, the upload, and the draft's link.
- What is never uploaded: a fixed list of folders and files, and anything that looks like a secret.
- The export pipeline as functions in `@ronneai/rmk/lib`, for 039.
- Keeping the contract [`docs/spec/native-readers.md`](../../spec/native-readers.md) true: how a
  tool's own files map back to an item (written with this milestone; §1–4 are this feature's).

**Out** (and where it goes instead):
- Agents, commands, rules and MCP servers → 040. Hooks, permission policies, output styles, status
  lines, LSP servers and bundles: not planned; they're authored in the web app.
- Dependencies between exported items → 041. A skill exported here declares none.
- An item `rmk` installed, edited or not: refused here, with a pointer to **Propose a change** on
  its page. Exporting it as a change proposal → 042.
- Skills in Codex's or Cursor's own formats beyond the shared `.agents/skills/` → 043.
- Submitting from the terminal: never; the person submits in the web app (owner, 2026-09-30).
- Changing anything on disk: `rmk export` only reads the project. It doesn't write `ronne.yaml`
  into the skill's folder.

## Behaviour

```
rmk export [<path|name>...] [--to <@scope>] [--name <name>] [--scope project|user]
           [--dry-run] [--yes] [--force]
```

**1. Which items.** An argument is a folder with a `SKILL.md`, or the name of a skill in
`.claude/skills/` or `.agents/skills/` under the project (or the home folder with `--scope user`;
`--scope` means what it means for `install`). With no argument, `rmk export` lists the skills it
found and where each comes from, and exports nothing; in a terminal it then asks which.

**2. Whose they are.** For each folder, in this order:

1. **The state file** (`.rmk/state.json`, or the user-scope one) has an entry for exactly this
   folder: `rmk` installed it. If it's unchanged there's nothing to export; if it was edited, the
   person wants a change proposal. Either way it's refused, naming the item and pointing to
   **Propose a change** on its page.
2. **Its `ronne.yaml` has a `version`.** Authors leave `version` out and the packer sets it
   (manifest spec §1), so this is a copy of something from a registry. Refused the same way;
   `--force` exports it as a new item, with the version removed.
3. **`SKILL.md` carries the managed marker** (MVP §3.3): a rule or command that `rmk` rendered as a
   skill. Refused.
4. Otherwise the person wrote it, and it's exported.

**3. Which scope.** Items are `@scope/name`, and only root creates scopes (010), so the person
chooses one that exists: `--to @team`, else the scope in the folder's own `ronne.yaml` if it has
one, else a prompt listing the registry's scopes (`GET /scopes`, 037) with their descriptions.
`rmk export` never picks a scope by itself. `--name` sets the name for a single item.

**4. The manifest.** The reader builds `ronne.yaml` from `SKILL.md`'s frontmatter:

| Field | From |
|---|---|
| `name` | `@<scope>/` + the frontmatter `name` when it's a valid item name, else the folder's name in lowercase with `-` for anything else; `--name` overrides |
| `type` | `skill` |
| `description` | the frontmatter `description`, on one line. Over 300 characters (the manifest's limit; skills often have longer ones) it's cut at a word, with a warning; `SKILL.md` keeps the full text |
| `license` | the frontmatter `license`, if any |
| `skill.entry` | `SKILL.md` |

A `ronne.yaml` the person wrote by hand in the folder is the base instead: its fields are kept and
only `name` is set. The manifest spec wants `SKILL.md`'s `name` to equal the item's short name, and
many hand-written skills leave it out (the tool falls back to the folder's name), so **the uploaded
copy** of `SKILL.md` gets that one line set, with a warning. The file on disk isn't touched.

**5. The files.** Everything in the folder, with its executable bit, except:
- **Never part of an item:** `.git/`, `.hg/`, `.svn/`, `node_modules/`, `__pycache__/`,
  `.DS_Store`, `Thumbs.db`, `.ronne/`.
- **Likely secrets:** `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `.npmrc`, `.netrc`.
- **Symbolic links** inside the folder: skipped, never followed. (A skill folder that is itself a
  link is read from where it points.)

A text file containing something that is certainly a secret (the prefixes 011's `secretLike` knows,
such as a provider's API key) **stops that item**: the file is named, the value isn't shown, and
the person removes it or passes `--force`. An item over the upload limits (MVP §12) is stopped too,
since the server would refuse it.

**6. The preview.** Before anything leaves the machine, `rmk export` shows, per item: the registry
and the account it's logged in as, the item's name, every file with its size, every file it
skipped and why, the generated `ronne.yaml`, the warnings, and the issues 011's checks find. If the
name is already published, it says Submit will refuse it and suggests the item's page. Then it asks
**"Upload n item(s) as drafts to <registry>?"**. `--dry-run` stops here; `--yes` skips the question.

**7. The upload.** One `POST /drafts` (037) per item. Then, per item: the draft's address, what is
left to fix before it can be submitted (the server's `issues` and `submitIssues`), and the reminder
that nothing is submitted until the person does it in the web app.

**Without a terminal, or with `--json`,** nothing is asked: `--to` and `--yes` are required
(`--dry-run` needs neither), and a missing one is a usage error whose details list the scopes.
`--json` prints `{ ok, registry, to, exported: [{ local, name, type, id, url, issues, submitIssues,
warnings, skipped }], refused: [{ path, code, message }] }`. With `--dry-run`, `planned` lists each
item as it would be uploaded (`local`, `name`, `type`, `files` with sizes, `manifest`, `skipped`,
`warnings`, `issues`, `published`); with no items named, `found` lists the skills found.

**Exit codes** (022): 0 when the uploads were made, or the person answered no; 1 on an error,
including an upload that failed after others succeeded (the output says which drafts exist); 2 for
a usage error.

**For the features that build on this.**
- `packages/core/src/read/` holds the readers: `readSkill(files, { itemName })` returns
  `{ manifest, manifestText, files, warnings, references }`, finding a hand-written `ronne.yaml`
  among the files, and `skillName(files, folderName)` suggests the short name. It reads no disk and no
  network, like a renderer (021), and is published as `@ronneai/core/read`. `references` is empty
  until 041.
- `packages/cli/src/export.ts` holds the rest: finding items, walking folders, the ownership
  check, `planExport(io, api, request)` (writes nothing, returns the plan and a fingerprint of
  every file's path, hash and executable bit) and `uploadExport(io, api, plan)`. Both are exported
  from `@ronneai/rmk/lib`; MVP §15's "MCP server and `rmk`" row already covers it.
- `docs/spec/native-readers.md` is the contract for the mapping, the ownership rules and the skip
  lists above; when they differ, the contract is right and this spec is fixed.

## Edge cases

- **Not logged in, or the registry can't be reached:** 022's errors, before anything is read.
- **The registry has no scopes:** the command says root creates them in the web app (010).
- **`SKILL.md` has no frontmatter, or no description:** the first line of the body becomes the
  description, and the draft arrives with 011's `skill_frontmatter` issue for the person to fix.
- **A folder name that can't be an item name** (`My Skill!`): normalised (`my-skill`), shown in the
  preview; `--name` changes it.
- **Two skills that would get the same name** (one in `.claude/skills/`, one in `.agents/skills/`):
  a bare name is ambiguous and the command lists both paths; identical folders count once.
- **The home folder as the project:** both scopes are the same folder; each skill is listed once.
- **A hand-written `ronne.yaml` that doesn't parse, or isn't a skill's:** that item is refused
  with the reason; the others go on.
- **An empty folder, or only skipped files:** refused.
- **A reverse proxy answers 413 before Ronne does:** the message says the server in front of the
  registry refused the size, and what 037's Documentation says about it.
- **Windows:** no executable bits; scripts arrive not executable, with a warning when a file has a
  `#!` line.
- **The same skill exported twice:** a second draft (037's open question). The preview can't know
  about the first one yet.

## Documentation

- **Exporting your own items**, a new topic in the "Publishing" group: what it's for; what `rmk
  export` reads and what it never uploads (the two lists, word for word); choosing the scope; the
  preview and the question; what arrives (a private draft) and what to do next (open it, fix what
  the checks say, submit); why an installed item is refused and where to propose a change instead;
  `--dry-run`, `--yes`, `--json`.
- **Installing with rmk → What rmk does** (`rmk#what`): one sentence and a link.
- **Overview → The path of an item** (`overview#path`): a draft can start in the web app or from
  `rmk export`.
- **My submissions:** a helper, "Already wrote it in your AI tool?", linking to the new topic.
- The README's `rmk` section lists the command.

## Acceptance criteria

- [ ] `readSkill` turns the example skill's rendered folder back into an item that passes `parseManifest` and `checkPackage`, and rendering that item gives the same folder.
- [ ] `rmk export` exports a hand-written skill from `.claude/skills/` and from `.agents/skills/`, in project and user scope, and prints the draft's address; the draft opens in the web editor with the same files.
- [ ] An installed skill, an installed and edited one, a copy with a `version`, and a rendered rule or command are each refused with the item's name and the pointer; `--force` exports only the copy.
- [ ] The scope comes from `--to`, the folder's `ronne.yaml`, or the prompt, and never from a default.
- [ ] Nothing in the two skip lists, and no symbolic link, is ever in a request; a certain secret stops the item; the preview lists every skipped file.
- [ ] `--dry-run` sends no `POST`; without a terminal, a missing `--to` or `--yes` exits 2 and sends none.
- [ ] A long description is cut with a warning, and a missing `name` is set in the uploaded `SKILL.md` while the file on disk stays byte for byte the same.
- [ ] `--json` prints the shape above, and the exit codes are as listed, including a partial upload.
- [ ] `pnpm packages:check` and `pnpm release:smoke` pass with the new `@ronneai/core/read` entry and library exports.
- [ ] An end-to-end test exports a skill with the built `rmk` against the Playwright instance.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

1. **Setting `name` in the uploaded `SKILL.md`** (recommended: what the person uploads should pass
   the checks they didn't know about), or leaving the file as it is and letting the draft arrive
   with an error to fix in the editor.
2. **`.gitignore`.** Recommended: don't read it; the fixed lists are predictable and shown in the
   preview. Honouring it would hide files a skill needs when a repository ignores build output.
3. **Skills in subfolders of a monorepo** (`packages/x/.claude/skills/`). Recommended: only the
   working folder's; the person runs `rmk export` there, or passes the path.
4. **Writing the generated `ronne.yaml` back into the skill's folder**, so the next export and a
   later `rmk` install know the item. Recommended: no, for now (export reads only); 042 needs a way
   to link a local folder to its item and should decide it.
5. **The list of likely secrets.** It errs towards skipping. A skill that really ships a `.key`
   sample has to be added in the web editor.
