# 130 — Languages: browse

> Milestone: M19 · Depends on: 129 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) · Contracts: none changed (the web app only; the API, `rmk` and MCP stay in English)

## Goal

The screens people use to **find and read** items speak the person's language: the Catalogue, the
item page (Overview, Tools and the rest), the Workspaces pages (list, a workspace's Members and
Requests, joining, moving a scope) and the inline helpers that sit on them. 129 built the machinery
and the shell; this feature moves these screens over, in Portuguese and French beside English.
Nothing about what the screens do changes.

## Scope

**In:**
- **Catalogue** (`features/catalogue`, `app/(app)/catalogue`, `components/catalogue/ItemCard`): search
  and sort (labels and hints), the type and workspace filters and their chips, the empty states,
  the pager, the page title.
- **Item page** (`features/item-page`, `app/(app)/items`, the versions and workspace item routes'
  titles): the header (license, keywords, owner), the version notice, the tabs and their risk
  counts, the Overview tab (install, usage in the last 14 days, dependencies, the per-type fact
  rows built by `overview/model.ts`, the dependency graph), the Tools panel, Propose and join.
- **Workspaces** (`features/workspaces`, `workspace-members`, `workspace-requests`,
  `current-workspace`, `app/(app)/workspaces/**`): the list, a workspace's page and tabs, members
  and roles, requests to join, scope moves and their impact list, the "Showing … only" line.
- **Words these screens share:** the item types (labels, descriptions, groups; `TYPE_INFO` in
  `components/submissions/item-types.ts`), the roles (three copies of `ROLE_LABELS` become one set
  of messages), the status badges, the data-table footer's noun and pager (plural by language),
  `ItemCard`, `TypeBadge`.
- **What the actions say.** The success lines ("Request sent.", "Added 2 people; 1 already in it.",
  "Moved to …") and the errors these screens can show. Today every action returns the English
  `error.message`; they return a code or go through `errorText` (`errors.<ClassName>` in
  `errors.json`), as 129 set out. The workspaces domain's error classes (about 30, some with
  variable parts and two with lists and plurals) get a text in all three languages; so do the
  identity and submissions errors that `proposeChange` and the member screens can raise.
- **Numbers and dates by language.** The `en-US` and `en-GB` locales written into `toLocaleString`
  and `toLocaleDateString` calls become the person's language (numbers: 12,345 / 12.345 / 12 345).
  Timestamps keep 049's numeric form.
- **Inline helpers.** The `Help` entries that sit on these screens move to messages: `workspace`,
  `personal-workspace`, `requests-who`, `member-roles`, `move-approve`, `current-workspace`,
  `contents`, `install`, `plugin`, `usage`, `support`, `propose`, `join`, `private-item`. The
  mechanism comes with them: an entry moves from the `HELP` object to `help.json`, keyed by its id,
  and its "Learn more" link already follows the language (129). The other entries move with their
  own area (131, 132) and stay English until then.
- **Guards.** The folders above join the raw-text scan (`biome.json` overrides); their routes join
  `MIGRATED_ROUTES`, so the phone sweep runs them in Portuguese and French; a component test per
  area in three languages, with the English-leak guard; a test per new error class.

**Out** (and where it goes instead):
- The draft editor, composer, submissions, reviews, the Versions tab's release actions and their
  errors: 131. (The Versions page title and the item page's own Versions tab label move here.)
- The dependency canvas's node text (`components/dependency-canvas`), shared with the composer:
  131. Only the Overview's "Loading the canvas…" moves here.
- The pieces a workspace's page shares with Admin › Workspaces: the scopes table and its dialogs
  (create, edit, move a scope), the workspace's own dialogs (edit, rename, visibility, delete) and
  the list of what a move changes (`MoveChanges`, shown when Approve refuses a move). They are
  translated with the admin sweep, 132; until then they read in English inside a translated page.
- Admin pages, Admin › Workspaces (the rename and move screens an administrator uses), settings,
  setup, SSO and SCIM: 132.
- The remaining `Help` entries: 131 and 132.
- Item content, what people write (descriptions of workspaces and scopes, request messages) and
  names: stay as authored.
- Native-speaker review of the new Portuguese and French: 133.

## Behaviour

- **No visible change in English.** Every English text stays as it is, except where it joined
  pieces in code and has to become a whole sentence; there the English reads the same.
- **Whole sentences.** Text that is built today from pieces ("by {owner}" next to a keyword list, the
  version notice's nested ternaries, "Runs aren't counted for {type}s", the Oxford-style list of
  silent tools, `{n} a day · {p}% succeeded`) becomes one message with placeholders, ICU plurals and
  `select` for the enum parts. A sentence with a link or a `<code>` uses rich-text tags
  (`<mono>…</mono>` as in `home.json`), never a split around the element.
- **Item types.** Per the glossary rule for terms `rmk` prints, a type's name stays as `rmk` prints
  it (skill, agent, rule, command, hook, MCP server…). Its description and its group (Guidance,
  Runtime & tools, Bundles) are translated. In a sentence the name is a placeholder, so no plural
  is built by adding an "s".
- **Dates inside sentences** ("Requested {date}") are one message with a placeholder for the
  `LocalTime` element, so the order of words follows the language.
- **Errors.** A known error shows its translation; an error with no translation shows the English
  message (never a blank). `ScopeMoveRefusedError` keeps returning its impact object; the labels of
  the impact list are messages.
- **English changes that come with whole sentences** (all small): "Runs aren’t counted for
  mcp-server items" (it was "mcp-servers", the type name with an "s" added in code), "1 run" where it
  said "1 runs" in the by-tool list, and "A, B and C" lists follow the language's list format. The
  chart's short days keep English's day-first order ("3 Oct").
- **Roles are one vocabulary.** root, admin, moderator, user: the glossary rows apply everywhere
  they are shown, from one set of messages.

## Edge cases

- A long French or Portuguese sentence in a table header, chip or tab must not break the layout:
  the phone sweep runs these pages in each language.
- A workspace name, an owner, a keyword, a license or a scope name inside a translated sentence is
  data: it is inserted as given, never translated, and a stored value that happens to look like a
  placeholder (`{x}`) is shown as typed.
- A count of zero uses the language's plural rule (`one` in French covers 0 and 1; Portuguese's
  covers 0 and 1 as well): the test checks 0, 1 and 2.
- An error class added later with no translation falls back to English and is caught by the
  per-class test only when it is in this feature's list; 133 turns the whole list into a check.
- A deep link such as `/workspaces/<name>/join` keeps working in every language; no URL changes.

## Documentation

- **Overview → Finding your way, Catalogue, Items, Workspaces** (`overview.tsx`, `catalogue.tsx`,
  `items.tsx`, `workspaces.tsx` in ronne-web): the Portuguese and French pages take the new names of
  the labels they mention (tabs, sort options, filters, role names, buttons), from the message
  files; English is unchanged. No new topic or section, so neither `topics.ts` changes.
- **Helpers:** the fourteen entries above are now in three languages; no new helper.
- `docs/knowledge/i18n.md`: the glossary gains the words these screens added (sort, filter, member,
  request, move, impact, install, usage).

## Acceptance criteria

- [ ] The Catalogue, the item page (all its tabs this feature covers), the Workspaces pages and
      their members, requests and moves render in English, Portuguese and French with no English
      text left over, on desktop and on a phone.
- [ ] The raw-text scan covers every folder listed in Scope and passes; the phone sweep runs their
      routes in Portuguese and French.
- [ ] Every action in scope returns a code or a translated message; the workspaces errors have a
      text in all three languages (tests for each class, including 0/1/2 counts and the lists).
- [ ] `toLocaleString`/`toLocaleDateString` in scope follow the language; no `en-US` or `en-GB`
      left.
- [ ] The fourteen helpers read in the person's language and their links open the website's page in
      it.
- [ ] The key-parity and placeholder tests pass.
- [ ] The Portuguese and French Documentation pages name the screens' labels as the app does.

## Decisions

- **The inline helpers move by area** (2026-10-21): the mechanism and the entries on the browse
  screens here, the others with their sweep. One big move of ~60 entries would be reviewed by no
  one; a helper left English beside a translated screen is the same state as before 129.
- **Type names stay as `rmk` prints them** (the glossary rule from 129): descriptions and groups
  are translated. See Open questions.

## Open questions

- **Item type names.** Keep `skill`, `agent`, `rule`… in English everywhere (proposed), or show a
  translated label beside them in the Catalogue's filters (the 129 spec allows "where a label
  exists")? The first is simpler and matches `rmk` and the API; the second reads better in
  Portuguese and French.
- **Success messages.** Return a code and let the component map it (like sign-in), or return text
  from `getTranslations` in the action? The plan assumes codes, as 129 did for the account.
