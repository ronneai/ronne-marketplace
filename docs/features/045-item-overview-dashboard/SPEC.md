# 045 — Item overview dashboard

> Milestone: M8 · Depends on: 044 · Design: [MVP §14.6](../../MVP/MVP.md#146-usage-telemetry--post-mvp) (what isn't built yet) · Contracts: [`docs/spec/manifest.md`](../../spec/manifest.md)

## Goal

The item page's Overview (044) follows the owner's mockup (kept locally with the other Stitch
mocks, 2026-09-30): a dashboard that says, on one screen, how to install the item, how much it's
used, whether it's safe, who looks after it, what it's made of and what it says. Only what the
registry already knows is shown. The usage numbers the mockup draws from telemetry are recorded in
[MVP §14.6](../../MVP/MVP.md#146-usage-telemetry--post-mvp) and planned as M9.

## Scope

**In:**
- A row of stat cards: downloads, versions, the tools it works in, and review and risk.
- An **Install** card on the Overview, with the two `rmk install` commands and a quick `--target`
  flag for each tool it installs in. The Install panel above the tabs goes away, so the other tabs
  open on their content.
- **Capabilities and guardrails:** what it can do on a machine (the risk flags), and the limits its
  manifest sets.
- The main file in a card that names its role ("system instruction" for an agent's prompt…).
- A side column: package verification (sha256 and size), configuration (044's settings rows),
  **Used by** (published items whose listed version depends on this one), **Maintainers and
  review** (the owner, and who approved the shown version), and **Included files**.
- The read-only dependency canvas, as in 044.

**Out** (and where it goes instead):
- Installs in active projects, invocations and their success rate, the harness distribution, the
  daily execution chart, the harness breakdown and invocation triggers: no data until opt-in usage
  telemetry exists ([MVP §14.6](../../MVP/MVP.md#146-usage-telemetry--post-mvp); M9: 046, 047).
- **Runtime requirements** (Node.js, git, the `rmk` version): the manifest has no field for them
  yet (048, planned).
- **"Signed" verification:** releases aren't signed yet ([MVP §14.2](../../MVP/MVP.md#142-signing-releases--post-mvp)). The card says what is
  true today: the checksum, which `rmk` checks on every install.
- A "sandboxed" or "low risk" rating, and declared prohibitions beyond what the manifest says: the
  registry describes what an item can do (014); it doesn't grade it.
- The mockup's footer (instance node and API version): app shell, not this page.

## Behaviour

**Tabs** are unchanged (044). The Install panel is only on the Overview now.

**Overview**, top to bottom, two columns on wide screens (main, then side), one column on narrow:

1. **Stat cards** (four, in a row; two by two on narrow screens):
   - **Downloads:** the item's download count (019), all versions, "through rmk and the API".
   - **Versions:** how many are published, and the newest's date; it links to Versions.
   - **Works in:** "N of M tools", with each tool's level badge; it links to Works in.
   - **Review:** "Approved" with who and when for a version released through review, or "Released
     without review" for one that wasn't (seeded or imported); then the risk summary ("Nothing
     flagged", or the flag kinds once each); it links to What it can do.
2. **Install** (main column): `rmk install @scope/name` and `@version`, each copyable. Under them,
   **Quick flags**: `--target <id>` for each tool it installs in, each copyable as the whole command.
   A note when the version is deprecated; "Every version is yanked" instead when nothing can be
   installed. The `install` helper stays.
3. **Capabilities and guardrails** (main column):
   - **What it can do:** each risk flag's sentence, as the What it can do tab lists them, or
     "Nothing flagged".
   - **Guardrails**, when the manifest sets any: an agent's tool list ("Only these tools: …"), a
     permission policy's `deny` and `ask` rules, a rule's activation and globs. Without any, the
     column says the item sets no limits of its own.
4. **The main file** (main column), as 044 shows it, in a card titled with the file and its role:
   system instruction (agent), skill entry (skill), rule body, command template, output style, hook
   script, status line script. "Open in Files" links to it.
5. **Dependencies** (main column): 044's read-only canvas, when there are any.
6. **Side column:**
   - **Package verification:** the sha256 (full, monospace, wrapping), the package size, and "rmk
     checks this checksum on every install".
   - **Configuration:** 044's settings rows; a permission policy's rules table.
   - **Used by:** each published item whose listed version depends on this item: name (a link), type
     and the range it asks for, up to 20, then "and N more". Hidden when there are none.
   - **Maintainers and review:** the owner (the first author, as the header says), and for the shown
     version "Approved by <name> on <date>", or "Approved by root (override)", or "Released without
     review".
   - **Included files:** every file with its size, `ronne.yaml` included, each a link to it in Files;
     the main file is listed too.

**Data:** the item page service adds `usedBy` (from `version_dependencies` joined to each item's
listed version) and the shown version's `approval` (the latest `approve` or `override` event of the
submission it was released from). Both are read with the page; nothing new is stored.

## Edge cases

- **An item no one depends on:** no Used by card.
- **A version released outside review** (`submission_id` null): "Released without review".
- **An approver who has since been removed:** "a former user".
- **A dependent whose listed version no longer depends on this item:** not listed (only listed
  versions count).
- **An item that installs in no tool:** no quick flags; Works in says "0 of 3 tools".
- **The artifact can't be read:** the main file, Included files and Configuration's file-based parts
  show 044's notice; the stat cards, Install, Used by and Maintainers still show.

## Documentation

- **Topic `items`, section `contents`:** rewritten for the dashboard: the stat cards, Install with
  quick flags, capabilities and guardrails, the side column; and a sentence on what isn't shown yet
  (usage, runtime requirements, signatures) and why.
- **Topic `rmk`, section `installing`:** the install commands are on the item's Overview, with a quick
  flag per tool.
- **Inline helpers:** `install` moves with the Install card; `contents` stays on Overview and Files.

## Acceptance criteria

- [x] The Overview shows the stat cards, Install with quick flags, capabilities and guardrails, the main file card, the canvas and the side column, from real data only.
- [x] The other tabs have no Install panel.
- [x] Used by lists the items whose listed version depends on this one, with their ranges.
- [x] Maintainers and review shows the approver of the shown version, an override, or "Released without review".
- [x] Nothing in the mockup that needs telemetry, runtime requirements or signatures is shown, and MVP §14.6 records what it needs.
- [x] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

- The mockup's "Total installs … in N active repository projects" needs project-level telemetry
  (046). Until then, is the download count the right first card? (Built as downloads.)
