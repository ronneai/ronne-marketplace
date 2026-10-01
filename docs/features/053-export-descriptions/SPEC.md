# 053 — Every exported item has a description

> Milestone: M7 · Depends on: 038, 039, 040, 043, 051 · Design: [MVP §4.1](../../MVP/MVP.md#41-submission-lifecycle-new-item-or-change-proposal) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md) (`description`), [`docs/spec/native-readers.md`](../../spec/native-readers.md)

## Goal

`description` is required in `ronne.yaml`, but many local items don't have one: a rule, a command
or an agent with no `description` in its frontmatter. Today such an item arrives as a draft that
can't be submitted, or with its body's first line as the description, which is often a heading.
With exports of dozens of items and bulk submitting ([052](../052-bulk-submit/SPEC.md)), that's
the most common thing left to fix one by one. This feature makes a description **mandatory at
export**. When the item doesn't carry its own, **the AI tool writes one from the item's content**,
or the person types one in `rmk`. The person sees it before anything is uploaded and can change it
later.

## Scope

**In:**
- Export knows which items **need a description**: those whose files don't say one.
- `plan_export` won't plan them without one. It answers which items need one, with what the
  assistant needs to write it, and takes the assistant's text as `descriptions`.
- `rmk export` asks for each in a terminal, suggesting the body's first line when there is one.
  Without a terminal it takes `--describe <item>=<text>` (repeatable) or `--descriptions
  <file.json>`. `--description` keeps working for a single item, now of any type.
- The preview shows each description and where it came from: the item's files, the AI tool, the
  person, or the draft being updated.
- Exporting again (051): a draft that already has a description keeps it when the local item still
  has none. `GET /api/v1/drafts` adds `description` for that.
- A skill's uploaded `SKILL.md` gets the description in its frontmatter when it has none, because
  the Agent Skills format requires it there. The local file isn't changed.

**Out** (and where it goes instead):
- **Writing descriptions into the local files:** export only reads (038). The person can add one
  to their file, and the next export uses it.
- **Generating descriptions on the server, or in `rmk` without an AI tool:** the registry has no
  model, and neither does `rmk`. The AI tool is the "harness" that writes them, through the MCP
  server; in a terminal, the person does.
- **Other required fields:** `description` is the only one export can't always fill. Name and type
  come from the item (038), and the rest are optional.
- **Change proposals** (042): they keep the base version's description unless the local item
  changed it (042's merge), so they never need one.

## Behaviour

**Needs a description.** After the reader runs (038, 040, 043), an item needs a description when:
- its reader found none (`description` is empty), or
- the description came from the body's first line (the reader's `description_from_body` warning),
  or
- it's a Claude Code rule, or another reader that only ever takes the first line (native-readers
  §5–10 say which), or
- it's an MCP server, which has none on disk (040 already asks for these).

**Unless** it is:
- a change proposal, whose description comes from the base version (042), or
- an item that updates a draft (051) whose `ronne.yaml` already has a description. That one is
  kept, and the preview says *kept from your draft*.

A description is **one line, at most 300 characters** (the manifest's limit). Text given by the
assistant or the person is trimmed, and newlines become spaces. Text over 300 characters is
**refused** with `description_too_long`, never cut: whoever wrote it shortens it.

**Mandatory.** `planExport` refuses with `descriptions_required` while any planned item needs a
description and has none. Its details list each one: `{ local, name, type, suggestion, files }`.
- `suggestion` is the body's first line, or null.
- `files` gives the item's main file's path and its first 4 000 characters, enough to describe it
  without reading the folder again.

No plan, preview or upload happens until every item has one.

**From the AI tool (MCP).** `plan_export` takes `descriptions`: an object from item (as
`list_local_items` shows it) to text. While some are missing, it answers like the scope question
does: no `planId`, `needs: ["descriptions"]`, and the items as above. The answer tells the assistant
to:

> Write one sentence for each item, at most 300 characters, saying what it does and when to use it,
> from its content; don't invent features. Then call plan_export again with `descriptions`, and show
> them to the person in the plan.

The plan's text shows each description with **written by your AI tool**, so the person sees it
before `export_items`. The tool and server instructions say the same. The descriptions are part of
the plan's fingerprint (039), so `export_items` uploads exactly what was shown.

**In a terminal (`rmk export`).** For each item that needs one, it asks:

```
@team/house-style (rule, .claude/rules/house-style.md) has no description.
In one sentence, what does it do? [Enter for: "Use tabs, not spaces, in every file."]
```

Enter takes the suggestion when there is one. Without a suggestion, an empty answer asks again.
After three empty answers, the item is left out with `description_required`, and the rest goes on.
Without a terminal, `--describe @team/house-style="…"` (repeatable, by item name or as shown
locally) or `--descriptions descriptions.json` (the same object as MCP) give them. A missing one
stops the export with `descriptions_required` and the list, exit `2`. `--description` gives it for
a single item.

**Where it goes.**
- Into `ronne.yaml`'s `description`.
- For a skill whose `SKILL.md` frontmatter has no `description`, also into the **uploaded** copy
  of `SKILL.md`'s frontmatter, where the Agent Skills format and the tools read it. The preview
  lists that file as changed from the local one. Other types are rendered from `ronne.yaml` at
  install (023–025), so their files stay as read.

**Changing it later.** The person edits `ronne.yaml` in the web editor, or adds a description to
the local file and exports again (051 updates the draft with the file's description). A draft's
description is never overwritten by a *suggestion*: only by the item's own files or by text the
person or the assistant gave for this export.

## Edge cases

- **A description from the frontmatter that's too long:** cut with 038's `description_cut`
  warning, as today. Only *given* text is refused when too long.
- **The assistant gives a description for an item that has its own:** the item's own wins, and the
  plan warns *the item's files already describe it; that one is used*. To change it, the person
  edits the file or the draft.
- **A key in `descriptions` that matches no planned item:** refused with `unknown_item`, naming
  it, so a typo doesn't silently leave an item without one.
- **Dependencies exported too (041):** each needs its own description, the same way, and they're
  asked for in the same round.
- **Updating a draft whose description was edited in the web app** while the local item has
  none: kept, as above. When the local item *does* have one, the local one replaces it, as all of
  051's files do. The preview says so.
- **A registry older than 053** (no `description` in `GET /drafts`): every item that needs one is
  asked for, as if there were no draft.

## Documentation

- **Exporting your own items**, a new section **Descriptions** (`export#descriptions`):
  - every item needs one;
  - where it comes from (the item's files, your AI tool, you), and what "needs one" means per type;
  - the 300-character line;
  - that it's shown before upload, kept when you export again, and changed in the web editor or in
    your file;
  - that local files are never changed.
- **Exporting your own items → The preview, From inside your AI tool, Options:** the description
  and its source in the preview; the assistant writes them; `--describe` and `--descriptions`
  (`--description` now for any single item).
- **Exporting your own items → What each type keeps and loses** (`export#keeps`): rules and MCP
  servers always need one, written by your AI tool or you.
- **Helpers:** none new. The editor's existing `description` field help is unchanged.

## Acceptance criteria

- [ ] An item with no description, or one taken from the body, or a rule, or an MCP server needs
  one. A proposal, or an update of a draft that has one, doesn't.
- [ ] `planExport` refuses with `descriptions_required` and each item's suggestion and excerpt
  until every item has one, and refuses given text over 300 characters and unknown keys.
- [ ] `plan_export` answers `needs: ["descriptions"]` with no `planId`, takes `descriptions`, shows
  each as written by the AI tool, and `export_items` uploads exactly those.
- [ ] `rmk export` asks in a terminal (Enter for the suggestion), takes `--describe` and
  `--descriptions` without one, and stops with exit `2` when one is missing.
- [ ] The uploaded `ronne.yaml` has the description; a skill's uploaded `SKILL.md` has it in its
  frontmatter when the local one didn't; local files are unchanged.
- [ ] Exporting again keeps a draft's description when the local item has none.
- [ ] The Documentation listed above says what the feature does now.

## Decisions

1. **The body's first line** (owner, 2026-10-01): a *suggestion*, not a description. The AI tool
   or the person confirms it, so a heading like "# House style" doesn't become one silently.

## Open questions

1. **Without an AI tool or a terminal** (CI): recommended `--describe` / `--descriptions`, refusing
   otherwise. `--accept-suggestions` (take every first line) could come later if scripts need it.
2. **Writing back to the local file.** Recommended: never (038's "export only reads"). An opt-in
   `--write-descriptions` that adds them to the local frontmatter, so the next export doesn't ask
   again, is possible later; 051's "kept from your draft" covers most of that need now.
