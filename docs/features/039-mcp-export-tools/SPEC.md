# 039 — MCP export tools

> Milestone: M7 · Depends on: 038, 027 · Design: [MVP §7](../../MVP/MVP.md#7-registry-mcp-server), [§12](../../MVP/MVP.md#12-security-considerations) · Contracts: [`docs/spec/native-readers.md`](../../spec/native-readers.md)

## Goal

The person says "export this skill to the marketplace" inside Claude Code, Codex or Cursor, and the
assistant does it: it finds the skill, asks which scope, shows what would be uploaded, and, once
the person approves, creates the draft and hands back its link. It is 038's pipeline behind three
tools, with 027's rule kept: nothing happens that the person hasn't seen as a plan first.

## Scope

**In:**
- Three tools in `packages/mcp`: `list_local_items`, `plan_export`, `export_items`.
- The plan-then-confirm flow for uploads, with the scope as a question the assistant must ask.
- The server's instructions to the assistant about that flow.

**Out** (and where it goes instead):
- Reading folders, the manifest, the skip lists, the upload → 038; this feature adds no rules of
  its own to them.
- Types other than skills → 040, which adds them to these tools without new ones.
- Dependencies → 041, which adds one input and one question.
- Submitting, reviewing and releasing through MCP: web only. The draft waits for the person.
- Exporting an arbitrary folder by path, and `--force`: terminal only (`rmk export`), on purpose.

## Behaviour

**Tools.** As in 027, each returns text for the assistant and structured content with the same
facts.

| Tool | Input | Does |
|---|---|---|
| `list_local_items` | `scope?`, `type?` | the items found in the project (or the home folder), each with its type, name, folder, and origin: **yours**, **installed** (`@scope/name@version`), **installed and edited**, **a registry copy**, or **written by rmk** (a rule or command rendered as a skill). No network |
| `plan_export` | `items: string[]`, `to?`, `name?`, `scope?` | 038's plan for those items: **uploads nothing**. Returns a `planId`, and per item the name it would get, every file with its size, every skipped file and why, the generated `ronne.yaml`, the warnings and the issues |
| `export_items` | `planId` | uploads exactly that plan, one draft per item (037), and returns each draft's address and what is left to fix before it can be submitted |

`scope` is `project` or `user`, as in every other tool. The marketplace scope is `to`
(`"@team"`), as in `rmk export --to`.

**The scope is the person's choice.** `plan_export` without `to` returns **no `planId`**: it
answers the registry's scopes (037) with their descriptions and `needs: ["to"]`. The assistant
can't go on without asking, and the server's instructions say so: *ask the person which scope to
export to; never choose it*. A `to` that doesn't exist answers `scope_not_found` with the list.

**Why two steps** is 027's reason: an AI tool asks permission before a call, not after. The plan is
in the conversation, with every file named, and the person approves the `export_items` call
knowing what leaves their machine. `list_local_items` and `plan_export` are annotated read-only.
`export_items` isn't; it is not destructive (it deletes and overwrites nothing) and it reaches
outside the machine (`openWorldHint`).

**Plans** follow 027: in memory, a random `planId`, **10 minutes**, used once. An export plan keeps
the request and the fingerprint of every file it would send (038); `export_items` plans again and
refuses with `plan_stale` when a file changed, and `plan_expired` when the plan is gone. Export
plans and install plans are kept apart: `apply_plan` doesn't know an export's `planId`, and
`export_items` doesn't know an install's.

**What may be exported.** Only what `list_local_items` lists with the origin **yours**: `items`
are names or folders from that list. Anything else is refused as 038 refuses it, with the pointer
to the item's page; there is no `force` over MCP. An item stopped by the secret scan or the limits
makes the plan say so and gets no `planId`.

**After the upload** the answer says, for each item, where the draft is, and that the person
reviews and submits it in the web app. The assistant has no tool to submit.

**Security** (MVP §12). The server still does only what the person's token allows. With this
feature it sends files from the person's machine to the person's registry, so: only items it
discovered in the tools' own folders, never a path; 038's skip lists and secret scan; the token
never in any output; and the upload only in the call the AI tool asks about. What arrives is a
private draft, so an assistant that was talked into exporting something puts it in front of nobody
but its author.

## Edge cases

- **No token:** `plan_export` and `export_items` say to run `rmk login`, as in 027, before
  anything else; `list_local_items` reaches no registry and works without one, as `list_installed`
  does.
- **The registry can't be reached:** `plan_export` and `export_items` answer `unreachable`;
  `list_local_items` still works.
- **The person edits the skill between the plan and the approval:** `plan_stale`; the assistant
  plans again and shows the new plan.
- **Several items, one fails to upload:** the answer lists the drafts that were created and the
  error for the rest; the plan is used up, and a new plan covers what's left.
- **Nothing to export:** `list_local_items` says so, and that `rmk install` is for the registry's
  items.
- **An installed item the person asks to export:** refused with the item's name and the pointer to
  **Propose a change**.
- **Two clients at once:** each has its own plans.

## Documentation

- **Registry MCP server → The tools** (`mcp#tools`): three rows in the table (`MCP_TOOLS`), with
  what each writes or sends. The sentence that every tool except `apply_plan` writes nothing
  becomes: two tools act, `apply_plan` on your files and `export_items` on the registry.
- **Registry MCP server → What it does** (`mcp#what`): "Authoring, review and releases stay in
  this website" becomes: it can also send an item you wrote to the registry as a draft; reviewing,
  submitting and releasing stay in this website.
- **Registry MCP server → Plans** (`mcp#plans`): export plans work the same way.
- **Registry MCP server → What it can reach** (`mcp#access`): it sends only items it found in your
  tools' folders, never the skipped files, and only when you approve `export_items`.
- **Exporting your own items** (038's topic): a section "From inside your AI tool", with an example
  of what to ask and what the assistant shows.
- **Installing with rmk → From inside your AI tool** (`rmk#mcp`): mentions exporting.

## Acceptance criteria

- [x] The server lists the three tools with the annotations above; `apply_plan` and `export_items` are the only tools that aren't read-only.
- [x] `list_local_items` gives the same items and origins as `rmk export --dry-run --json` in the same folder.
- [x] `plan_export` without `to` returns the scopes and no `planId`, and sends no `POST`; with `to` it returns the plan and sends none either.
- [x] `export_items` creates the drafts of exactly that plan and returns their addresses; it refuses an expired plan, a used one, a stale one (a file edited after the plan), and an install plan's id.
- [x] A path outside the listed items, and an installed item, are refused; there is no way to force them.
- [x] Without a token every tool that reaches the registry says to run `rmk login`; the token never appears in any output.
- [x] An end-to-end test drives the built `rmk-mcp` against the Playwright instance: list, plan without a scope, plan, export, and the draft opens in the web app.
- [x] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

1. **`export_items` as its own tool** (recommended: the permission prompt then says "export" and
   not "apply", and the two kinds of plan can't be confused), or `apply_plan` taking export plans
   too, which keeps one acting tool but makes its prompt ambiguous.
2. **The input's name for the marketplace scope:** `to`, matching `rmk export --to` (recommended),
   or something longer such as `marketplaceScope`, which reads better to a model but differs from
   the CLI.
3. **Paths over MCP.** Recommended: only discovered items. It costs the case "export this folder
   in my Downloads", which the terminal covers.
