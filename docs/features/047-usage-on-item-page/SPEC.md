# 047 — Usage on the item page

> Milestone: M9 · Depends on: 046 · Design: [MVP §14.6](../../MVP/MVP.md#146-usage-telemetry--post-mvp) · Builds on: [045](../045-item-overview-dashboard/SPEC.md), [016](../016-version-management/SPEC.md)

## Goal

The usage that 046 collects becomes visible where people decide about an item. Its Overview shows how
often it's installed, in which tools, how often it runs and how those runs end, as the owner's mockup
draws it. The Versions page shows which versions are still being run, so a moderator knows what a
deprecation or a yank would touch. Every number comes from people who turned reporting on, and the
page says so.

## Scope

**In:**
- **Overview stat cards (045):** with enough data, **Installs** (30 days) replaces Downloads, and
  **Runs** (30 days) replaces Versions. Works in gains each tool's share.
- **A Usage card on the Overview** (main column, after Install): daily runs for the last 14 days
  with the peak, runs by tool, runs by trigger, and how the runs ended.
- **The Versions page (016):** runs and installs per version over 30 days, also in the deprecate and
  yank dialogs.
- The summary queries in the usage domain (`domains/usage`), over 046's `usage_daily`.
- A minimum of activity below which nothing is shown, and the "opt-in" note wherever a number
  appears.

**Out** (and where it goes instead):
- **Projects** ("installed in N active projects"): not collected (046's decision 1); kept for later in
  [MVP §14.6](../../MVP/MVP.md#146-usage-telemetry--post-mvp).
- The home page's "Most used": stays on downloads (decision 2).
- Usage in the registry API, `rmk info` or the MCP server: web only for now, like 044's contents.
- Usage of the whole instance (an admin dashboard, top items by runs): not asked for.
- Exporting the data (CSV): not asked for.
- Tier-2 tools (028–030, on hold).

## Behaviour

**When usage is shown.** An item's usage appears only when it has **at least 20 reported events**
(installs plus runs) in the last 30 days. Under that, the Overview looks as 045 built it, and in place
of the Usage card there's one line: "Usage appears once this item has 20 reported installs or runs in
30 days. Reporting is opt-in." When the instance doesn't accept usage (`USAGE_TELEMETRY=off`) and has
none stored, neither the line nor anything else about usage appears. The minimum keeps a handful of
events from looking like a trend. It can't tell one busy person from many, and the Documentation says
so.

Who sees it: everyone signed in, like the rest of the item page (decision 3).

**Stat cards** (with enough data; four, as in 045):
1. **Installs, 30 days:** reported installs, and under it the removals and the all-time downloads
   ("12 removed · 1,240 downloads"). Links to the Usage card.
2. **Runs, 30 days:** the total of `run` events, the average per day, and the success rate: the share
   of runs that ended in `success` among those whose outcome is known, shown only when at least 20
   runs have a known outcome ("success rate not reported" otherwise). Links to the Usage card. For a
   type with no runs (hook, rule, output style, status line, permission policy, LSP server), the card
   says "Not counted for <type>s".
3. **Works in:** as 045, plus each tool's share of the runs ("Claude Code 62% · Cursor 28% · Codex
   10%"), or of the installs for a type without runs, in order of the share.
4. **Review:** unchanged.

Versions, which the Runs card replaces, is still the Versions tab with its count.

**Usage card** (main column, after Install; titled "Usage, last 14 days"):
- **Daily runs:** a bar per UTC day for the 14 full days before today, with the peak day labelled
  ("Peak: 412 on 3 Oct"), and an accessible table of the same numbers. Today, which is still filling
  up, is left out.
- **By tool:** runs per tool, as a bar with each tool's count and share.
- **By trigger:** typed by a person, chosen by the model, delegated by an agent, CI, not reported.
- **How runs ended:** success, error, cancelled, not reported.
- **Gaps, said plainly:** under By tool, one line per tool the item installs in that can't report its
  runs ("Codex and Cursor don't report skill runs; there, only installs are counted"), from the same
  table as the `usage` Documentation topic (046).
- A help helper and the note "Usage is opt-in; numbers come from people who turned it on."
- For a type with no runs, the card shows installs and removals per day instead.

**Charts** are built from the design system's tokens with plain SVG and CSS, with no chart library:
flat, teal for the data, muted for the rest, red and amber never (they mean errors and warnings, not
"error runs"). Each chart has a text alternative.

**Versions page (016):** two columns, **Runs** and **Installs** over the last 30 days per version,
shown when the item as a whole passes the minimum; versions with none show "–". The **deprecate**
and **yank** dialogs say "Reported in the last 30 days: N runs, M installs" when the item passes the
minimum, so the moderator sees what still uses the version before confirming.

**Data:** two queries in the usage domain, read with the page (nothing new is stored):
- `usageSummary(itemId, today)`: installs, removals and runs over 30 days, per tool and with the
  outcome split; the 14 daily totals; runs by tool, trigger and outcome over 14 days; and whether the
  minimum is met.
- `usageByVersion(itemId, today)` for the Versions page.
Both read `usage_daily` by `(item_id, day)`. `today` is passed in, so tests fix the clock.

## Edge cases

- **Exactly 20 events, then a day ages out:** the usage disappears again; the page never shows
  numbers under the minimum.
- **Plenty of installs but no runs** (installed in tools that can't report this type): Runs says "No
  runs reported" with the gap line; the Usage card shows the gaps.
- **Runs with no outcome at all:** "success rate not reported".
- **A version that was yanked:** still listed with its runs and installs; that's when the number
  matters.
- **Usage switched off after data was collected:** what's stored is shown until retention deletes it
  (046's 90 days), with "This instance no longer collects usage" in the Usage card.
- **A day with no reports:** a zero bar, not a gap.
- **An item installed for several tools at once:** one install per tool, so Installs counts tool
  installs, and the Documentation says so.

## Documentation

- **Topic `usage`** (046): a new section `reading` ("Reading the numbers"): installs and runs, the
  20-event minimum and what it can't tell, what counts as a run in each tool, the success rate and its
  20-run rule, triggers, the gaps, and the versions columns.
- **Topic `items`, section `contents`:** the usage cards and the Usage card replace the sentence that
  usage isn't shown (045).
- **Topic `versions`, section `deprecate-yank`:** the runs and installs in the dialogs.
- **Inline helpers:** a new `usage` helper on the Usage card and the minimum line: "Counted from
  people who turned on usage reporting with rmk telemetry on. Shown once an item has 20 reported
  installs or runs in 30 days." It links to `usage#reading`.

## Acceptance criteria

- [ ] Under 20 events in 30 days, the Overview matches 045 with the minimum line; at 20 and over,
      Installs, Runs and Works in's shares appear.
- [ ] The success rate appears only with 20 or more runs whose outcome is known.
- [ ] The Usage card shows 14 full days with the peak, by tool, by trigger and by outcome, each with a
      text alternative, and the gaps for the item's type and tools.
- [ ] Types without runs show installs instead of runs.
- [ ] The Versions page and the deprecate and yank dialogs show runs and installs per version under
      the same minimum.
- [ ] With usage switched off and no data, nothing about usage appears.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

Answered by the owner on 2026-09-30:

1. **When usage shows:** a minimum of activity, 20 reported installs or runs in 30 days (projects
   aren't counted, so "5 projects" can't be the rule).
2. **The home page's "Most used":** stays on downloads, which every instance has without opt-in.
3. **Who sees usage:** everyone signed in, like the rest of the item page.

## Open questions

- None.
