# 047 — Usage on the item page

> Milestone: M9 · Depends on: 046 · Design: [MVP §14.6](../../MVP/MVP.md#146-usage-telemetry--post-mvp) · Builds on: [045](../045-item-overview-dashboard/SPEC.md), [016](../016-version-management/SPEC.md)

## Goal

The usage that 046 collects becomes visible where people decide about an item: its Overview shows
how many projects use it, in which tools, how often it runs and how those runs end, as the owner's
mockup draws it. The Versions page shows which versions are still in use, so a moderator knows who a
deprecation or a yank would reach. Every number comes from people who turned reporting on, and the
page says so.

## Scope

**In:**
- **Overview stat cards (045):** with enough data, **Active projects** replaces Downloads, and
  **Runs** (30 days) replaces Versions. Works in gains each tool's share of the active projects.
- **A Usage card on the Overview** (main column, after Install): daily runs for the last 14 days
  with the peak, runs by tool, runs by trigger, and how the runs ended.
- **The Versions page (016):** active projects per version, also in the deprecate and yank dialogs.
- The summary queries in the items domain, over 046's tables.
- A threshold below which nothing is shown, and the "opt-in" note wherever a number appears.

**Out** (and where it goes instead):
- Per-project data of any kind (which projects, their ids, when each was seen): never shown, to anyone
  (046's open question 3).
- The home page's "Most used": stays on downloads (Open questions).
- Usage in the registry API, `rmk info` or the MCP server: web only for now, like 044's contents.
- Usage of the whole instance (an admin dashboard, top items by runs): not asked for.
- Exporting the data (CSV): not asked for.
- Tier-2 tools (028–030, on hold).

## Behaviour

**When usage is shown.** An item's usage appears only when **at least 5 projects** are active for it
(046's definition: installed, not removed, seen within `activeDays`). Under that, the Overview looks
as 045 built it, and the Usage card is replaced by one line: "Usage appears once 5 projects that
report it use this item. Reporting is opt-in." When the instance doesn't accept usage
(`USAGE_TELEMETRY=off`) and has none stored, neither the line nor anything else about usage appears.
The threshold keeps a single team's or person's habits from being read off the page.

**Stat cards** (with enough data; four, as in 045):
1. **Active projects:** the count, "in the last 30 days", and the downloads under it ("1,240
   downloads"). Links to the Usage card.
2. **Runs, 30 days:** the total of `run` events, the average per day, and the success rate: the share
   of runs that ended in `success` among those whose outcome is known, shown only when at least 20
   runs have a known outcome ("success rate not reported" otherwise). Links to the Usage card. For a
   type with no runs (hook, rule, output style, status line, permission policy, LSP server), the card
   says "Not counted for <type>s" and shows installs over 30 days instead.
3. **Works in:** as 045, plus each tool's share of active projects ("Claude Code 62% · Cursor 28%
   · Codex 10%"), in the order of the share.
4. **Review:** unchanged.

Versions, which the Runs card replaces, is still the Versions tab and its count.

**Usage card** (main column, after Install; titled "Usage, last 14 days"):
- **Daily runs:** a bar per UTC day for the 14 full days before today, with the peak day labelled
  ("Peak: 412 on 3 Oct"), and an accessible table of the same numbers. Today, which is still filling
  up, is left out.
- **By tool:** runs per tool, as a bar with each tool's count and share.
- **By trigger:** typed by a person, chosen by the model, delegated by an agent, CI, not reported.
- **How runs ended:** success, error, cancelled, not reported.
- **Gaps, said plainly:** under By tool, one line per installed tool that can't report this item's
  runs ("Codex and Cursor don't report skill runs; their projects count as installs only"), from the
  same table as the `usage` Documentation topic (046).
- A help helper and the note "Usage is opt-in; numbers come from people who turned it on."
- For a type with no runs, the card shows only installs and removals per day.

**Charts** are built from the design system's tokens with plain SVG and CSS, with no chart library:
flat, teal for the data, muted for the rest, red and amber never (they mean errors and warnings, not
"error runs"). Each chart has a text alternative.

**Versions page (016):** a column **Active projects** per version (046's `usage_projects.version`),
shown under the same 5-project rule for the item as a whole; versions with none show "–". The
**deprecate** and **yank** dialogs say "N active projects report this version" when the item passes
the rule, so the moderator sees the reach before confirming.

**Data:** two queries in the items domain, read with the page (nothing new is stored):
- `usageSummary(itemId, today)`: active projects in total, per tool and per version; runs over 30
  days with the outcome split; the 14 daily totals; runs by tool, trigger and outcome over 14 days;
  installs and removals for types without runs.
- `activeProjectsByVersion(itemId, today)` for the Versions page.
Both read `usage_daily` by `(item_id, day)` and `usage_projects` by `item_id`; `today` is passed in,
so tests fix the clock.

## Edge cases

- **Exactly 5 active projects, then one is removed:** the usage disappears again; the page never shows
  "4".
- **Plenty of active projects but no runs** (installed in tools that can't report this type): Runs
  says "No runs reported" with the gap line; the Usage card shows the gaps.
- **Runs with no outcome at all:** "success rate not reported".
- **A version that was yanked:** still listed with its active projects; that's when the number
  matters.
- **Usage switched off after data was collected:** what's stored is shown until retention deletes it
  (046's 90 days), with "This instance no longer collects usage" in the Usage card.
- **A day with no reports:** a zero bar, not a gap.
- **An item no project reports:** as below the threshold.
- **Several tools in one project:** counted once per tool in By tool and Works in shares, once in
  the Active projects total.

## Documentation

- **Topic `usage`** (046): a new section `reading` ("Reading the numbers"): active projects, the
  5-project rule and why, runs and what counts as one per tool, the success rate and its 20-run rule,
  triggers, the gaps, and the versions column.
- **Topic `items`, section `contents`:** the usage cards and the Usage card replace the sentence that
  usage isn't shown (045).
- **Topic `versions`, section `deprecate-yank`:** the active projects in the dialogs.
- **Inline helpers:** a new `usage` helper on the Usage card and the threshold line: "Counted from
  people who turned on usage reporting with rmk telemetry on. Shown once 5 projects report it." It
  links to `usage#reading`.

## Acceptance criteria

- [ ] Under 5 active projects, the Overview matches 045 with the threshold line; at 5 and over, the
      Active projects, Runs and Works in shares appear.
- [ ] The success rate appears only with 20 or more runs whose outcome is known.
- [ ] The Usage card shows 14 full days with the peak, by tool, by trigger and by outcome, each with a
      text alternative, and the gaps for the item's type and tools.
- [ ] Types without runs show installs instead of runs.
- [ ] The Versions page and the deprecate and yank dialogs show active projects per version under
      the same rule.
- [ ] No page, response or markup contains a project id or anything per project.
- [ ] With usage switched off and no data, nothing about usage appears.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Open questions

1. **The threshold:** 5 active projects (specified). Higher on large instances? It could become an
   instance setting later.
2. **The home page's "Most used":** keep downloads (specified), or rank by active projects once
   enough items pass the threshold. Downloads count CI runs and reinstalls; active projects count
   only people who opted in. Mixing the two would make the list hard to explain.
3. **Who sees usage:** everyone signed in, like the rest of the item page (specified), or authors,
   moderators and root only.
