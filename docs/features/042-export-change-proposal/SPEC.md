# 042 — Export a change as a proposal

> Milestone: M7 · Depends on: 041, 017 · Design: [MVP §4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal), [§4.2](../../MVP/MVP.md#42-release), [§3.3](../../MVP/MVP.md#33-platform-renderers) · Contracts: [`docs/spec/native-readers.md`](../../spec/native-readers.md), [`docs/spec/cli-files.md`](../../spec/cli-files.md)

## Goal

A person who improved an item in their AI tool, whether one `rmk` installed or one they exported
earlier and that is now published, sends the change back as a **change proposal** (017) instead of
rebuilding it in the web editor. Today `rmk export` refuses such an item and points to **Propose a
change** on its page (038); this feature does the proposing from where the edit was made.

## Scope

**In:**
- `rmk export` and the MCP export tools accept an item whose registry counterpart is known, and
  plan a **change proposal** to it instead of refusing it:
  - an item `rmk` installed and the person **edited** since (the state file names the item, the
    version and the hash that no longer matches);
  - an item of the person's own whose name is **already published** in the chosen scope with the
    same type (041 calls it "already published"; exported earlier, released since, edited again).
- **Merging** the local edit onto the base version, so what the local files can't express (keywords,
  dependencies, `targets`, anything the renderer or reader drops) is kept from the base.
- The **API**: `POST /api/v1/drafts` with a `base` version creates a proposal draft (017's
  `item_id` and `base_version_id`) with the uploaded files.
- The preview shows the change against the base, file by file.

**Out** (and where it goes instead):
- Installs rendered for Codex or Cursor: after 043, which reads their files; until then refused
  with the pointer, as today.
- Types the export readers don't cover (hooks, permission policies, status lines, LSP servers,
  output styles, bundles): refused with the pointer; they're changed in the web editor.
- Replacing an open proposal the person already has for the item: a second draft, as for new
  items (037's open question); see Open questions.
- Rebasing: 017's, in the web app. A proposal whose base isn't the item's newest version arrives
  stale, and the preview says so.
- Changing an item's name, scope or type: a proposal can't (017).

## Behaviour

**When it applies.** For each item `rmk export` resolves (038, 040):

| Whose it is | Today | With 042 |
|---|---|---|
| installed, unchanged | refused: nothing to export | the same |
| installed and **edited** | refused, pointing to Propose a change | a **proposal** to that item, based on the installed version |
| written by rmk (the marker, no state entry) | refused | the same: without the state, the edit can't be told from the render |
| a registry copy (`ronne.yaml` with a `version`) | refused, or a new item with `--force` | a **proposal** based on that version, when the item exists; `--force` still makes a new item |
| yours, and the scope has a **published** item of that name and type | a new-item draft that Submit refuses (041 depends on it instead) | a **proposal** based on the item's `latest`, when it's the item being exported (not a dependency) |

The person sees which it is in the list (`list_local_items`' origins are unchanged: "installed
and edited" items can now be exported) and in the preview (**Proposal to @team/reviewer, from
1.2.0**).
`--new` keeps 038's behaviour for the last two rows (a new item; Submit refuses a taken name, so
it's only useful with `--name`).

**The base.** The installed version from the state file, the `version` in a registry copy, or
`latest` for a published name. `rmk` downloads its artifact (`GET …/tarball`, 019) and checks its
checksum, as `install` does.

**The merge** (three-way, by field and file). With **B** the base version's item, **R** what the
reader reads back from B rendered for the same tool (what an untouched install looks like to
export), and **L** what the reader reads from the local files:
- a file or manifest field where **L equals R** is taken from **B**: unchanged locally, so
  anything the round trip loses (keywords, `license`, `targets`, the base's own dependencies, a
  tool Claude Code has no name for) survives;
- where **L differs from R**, it's taken from **L**: that's the person's edit;
- a file in L but not in R is added; a file in R but not in L is removed.

For a skill the folder is the item, so R is B's files and the merge is by file. For an agent,
command, rule or MCP server, R and L are the readers' items, compared field by field (description,
tools, model, arguments, globs, the server's settings) and by content file (`prompt.md`,
`command.md`, `rule.md`). The markers `rmk` writes are removed before reading. 041's dependency
findings apply to the proposal as to a new item: a new dependency of the person's own is offered
for export, and declared.

**Nothing changed.** When the merge gives B's files exactly (an edit that the manifest can't
carry, such as a Claude Code-only setting), the item is refused with the list of what was dropped,
since 017 refuses a proposal that changes nothing.

**The preview** shows, per proposal: the item and base version, and whether that's still the
newest (else: "arrives stale: rebase it in the web app after uploading"); every file added,
removed or changed, with a line count of the change; the manifest fields that change, old and new;
and what the local files say that the item can't carry (the readers' warnings). Then the same
question as 038.

**The API.** `POST /api/v1/drafts` takes an optional `base: "<version>"`. With it, `name` must be
a published item, `type` must be its type, and the version must exist (yanked included, as 017
allows): the draft is a proposal with the uploaded files, not the base's. The checks and limits
are 037's, and the 50-draft limit counts proposals too. New codes: `404 item_not_found`,
`404 version_not_found`, `400 type_changed`. The response gains `proposal: { item, baseVersion,
stale }`, and `submitIssues` include 017's (no change, type changed). The audit event is 037's, with
`proposal: true` and the base version in its metadata.

**After the upload** the result says the draft is a proposal to `@team/reviewer` from `1.2.0`, and
that it's reviewed and released as the item's next version (017). A stale one says to rebase it
first.

**For the features that build on this.** The merge is `mergeChange(base, rendered, local)` in
`packages/core/src/read/`, pure, over `ReadResult`s and package files, so the web app could use it
later (a proposal from an uploaded folder). `planExport` gains `PlannedItem.proposal:
{ item, baseVersion, stale }`; `uploadExport` sends `base`.

## Edge cases

- **The installed version was yanked:** the proposal is based on it anyway (017 allows it) and
  arrives stale when a newer version exists.
- **The item was installed for several tools** (Claude Code and Codex): the state has an entry per
  tool. The tool whose files changed is read; if files changed for more than one, the command lists
  them and asks for `--target` (the MCP tools take `target`).
- **Edited, then the installed version isn't in the registry any more** (a different registry, or
  the item was renamed): refused, saying which item and version the state names.
- **The person edited a file the item doesn't own** (a new file next to an installed agent): not
  part of the item; only what the state entry covers is read (a skill's whole folder, an agent's one
  file, a server's one key).
- **A skill folder installed for Claude Code and also linked into `.agents/skills/`:** one item,
  counted once (038).
- **The merge changes `ronne.yaml`'s `version`:** never; drafts carry none (017).
- **A published name, but the person means a new item:** `--new` (and `--name` to rename it).
- **The same edit exported twice:** two proposal drafts; see Open questions.
- **The base version has dependencies the local item no longer uses:** kept, since a reference
  the reader can't see isn't evidence of removal; the person removes them in the editor. The preview
  lists them.

## Documentation

- **Exporting your own items** (038's topic), a section "Proposing a change": which items become
  proposals, the base version, what's kept from it, the preview of the change, `--new`, and that
  review and release follow 017.
- **Exporting your own items → Items rmk installed** (`export#installed`): installed and edited
  items become proposals now; unchanged ones and other tools' installs are still refused.
- **Changing a published item → Proposing a change** (`changes#propose`): a sentence that a
  proposal can also come from `rmk export`, from the tool where the edit was made.
- **Installing with rmk → Your own edits** (`rmk#edits`): an edited install can be sent back as a
  proposal with `rmk export`.
- **Registry MCP server → The tools** (`mcp#tools`): `plan_export` plans proposals too, and the
  origin `installed and edited` can be exported.

## Acceptance criteria

- [ ] An installed agent, skill, command, rule and MCP server, each edited, plans as a proposal to its item based on the installed version; unchanged ones are still refused.
- [ ] The merge keeps what the round trip loses (keywords, `license`, `targets`, the base's dependencies, an unmapped tool) and takes every local edit, field by field and file by file; tests cover each type and each row of the merge.
- [ ] An own item whose name is published with the same type plans as a proposal from `latest`; `--new` makes a new-item draft.
- [ ] An edit the item can't carry is refused as "nothing changed", naming what was dropped.
- [ ] `POST /api/v1/drafts` with `base` creates a proposal draft with the uploaded files, answers each new error code, and counts towards the draft limit; the audit event says it's a proposal.
- [ ] A proposal whose base isn't the newest arrives stale, and both the preview and the result say so.
- [ ] Installs for more than one tool with edits in more than one ask for `--target`.
- [ ] An end-to-end test installs a published skill with the built `rmk`, edits it, exports it as a proposal, and a moderator sees the diff to the base in the review page.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

1. **Replacing an open proposal.** Exporting the same edit twice makes two drafts. Recommended:
   leave it, and have the preview say when the person already has an open proposal (or draft) for
   the item, with its link; replacing a draft's files through the API can come later.
2. **Published own items as proposals by default** (recommended: the loop "export, release, edit,
   export again" is the common one, and a new-item draft with a taken name is refused anyway), or
   ask each time.
3. **Items written by rmk without a state entry** (the state file was deleted): refused
   (recommended: the edit can't be separated from the render), or treated like a registry copy
   using the marker's item and version as the base.
4. **Recording the link.** After a proposal from an own item is released, the local folder still
   isn't an install. Recommended: nothing to record; the next export finds the published name
   again. Writing the item into `rmk.lock` would make it look installed and block the next export.
