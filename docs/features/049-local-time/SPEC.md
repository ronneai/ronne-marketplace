# 049 — Local time

> Milestone: cross-cutting · Depends on: 032 · Design: [MVP §9.4](../../MVP/MVP.md#94-database) (timestamps are stored in UTC)

## Goal

People read dates and times in their own time zone. Timestamps stay stored in UTC (MVP §9.4); only
how the web app shows them changes (owner, 2026-10-01). Today every page prints UTC, such as
`2026-09-27 14:05 UTC`, so the same moment reads the same for everyone but rarely matches the
reader's clock.

## Scope

**In:**
- A shared `<LocalTime>` component (`components/ui/LocalTime.tsx`): a `<time dateTime="…">` that the
  server renders in UTC, as today, and the browser rewrites in its own time zone once the page has
  loaded, with the UTC time on hover.
- Every timestamp the web app shows: the item header and catalogue cards, Overview (newest version,
  approval), Versions (published, yanked), submissions, the review queue and conversation, access
  tokens, users, scopes, the draft editor's "Submitted for review on…", the created token's expiry,
  and the audit log (owner's default: local, UTC on hover).
- One sentence in the Documentation saying times are local, with UTC on hover.

**Out** (and where it goes instead):
- **Storage, the API and `rmk`:** unchanged. The API returns ISO 8601 in UTC; `rmk` prints UTC.
- **Usage days (047):** the chart's days and "Peak on…" are UTC days, because usage is summed per
  UTC day on the server. They stay UTC.
- **Audit log filters:** the From and To dates stay UTC days (a query parameter), and the filter
  says so.
- **A time zone setting** per person or a cookie that lets the server format local time: not now.
  Without them, the first paint shows UTC for a moment (Behaviour).

## Behaviour

**`<LocalTime value precision>`** takes the moment as an ISO string (it's a client component, so it
receives text, not a `Date`) and a precision:
- `minute` (default): server and first paint `2026-09-27 14:05 UTC`; in the browser
  `2026-09-27 11:05 GMT-3` in the reader's time zone, with the short zone name `Intl` gives.
- `second`: the audit log's, `2026-09-27 14:05:09 UTC` → `2026-09-27 11:05:09 GMT-3`.
- `day`: `2026-09-27` → the reader's local date for that moment (it can differ from the UTC date
  around midnight); no zone name, which would crowd tables of dates.

Every form keeps the `YYYY-MM-DD HH:MM` order, monospace where it was, so tables don't change width
much. The `title` is always the UTC time (`2026-09-27 14:05 UTC`), and `dateTime` the ISO moment.

**First paint:** the server can't know the reader's time zone, so it renders UTC, as now; the
browser switches to local right after hydration. Without JavaScript, people keep seeing UTC, labelled.

**Places that built a sentence or a joined line** ("published …", "Submitted for review on …",
"Expires … (UTC)") render the component inside it instead.

## Edge cases

- **A reader in UTC:** the zone name reads `UTC`, and nothing visibly changes.
- **Daylight saving:** each moment uses the offset in force on its own date (Intl does this).
- **A day near midnight:** `day` precision shows the reader's local date, so a version published at
  `2026-09-28 01:00 UTC` reads `2026-09-27` in São Paulo.
- **Tests:** server-rendered HTML still contains the UTC text, so page tests that look for it keep
  working; the component's own test and one end-to-end test check the local form.

## Documentation

- **Topic `overview`:** one sentence: dates and times are in your browser's time zone; hover one to
  see it in UTC. Usage days are UTC days (said in `usage` › Reading the numbers, with 047).
- **Inline helpers:** none.

## Acceptance criteria

- [x] `<LocalTime>` renders UTC on the server and the reader's local time in the browser, in the three
      precisions, with UTC in `title` and the ISO moment in `dateTime`.
- [x] Every timestamp listed in Scope uses it; the API, `rmk` and usage days stay UTC.
- [x] An end-to-end test in a non-UTC time zone sees local times on an item page and in the audit log.
- [x] The Documentation says times are local, with UTC on hover.

## Open questions

- None. (The audit log follows the rest: local, with UTC on hover; owner's default, 2026-10-01.)
