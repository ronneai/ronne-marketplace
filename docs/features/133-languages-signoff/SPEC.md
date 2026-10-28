# 133 — Languages: sign-off

> Milestone: M19 · Depends on: 129, 130, 131, 132 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) · Contracts: none changed (the web app and the website's Documentation only; the API, `rmk` and MCP stay in English)

## Goal

Close the languages milestone. 129 built the machinery and 130–132 moved every screen into
Portuguese and French beside English. This feature makes that **true everywhere and checkable
for good**: the raw-text rule covers the whole app instead of a list that grows, the tests that
look for English leaking into a translated page are as strong as we can make them, the phone
sweep runs every page in each language, the Documentation links open the right page in the right
language, a reviewer of each language has read the messages (agents, owner 2026-10-27), and the website's wording
agrees with the app's. Nothing about what the screens do changes.

## Scope

**In:**
- **The raw-text rule over the whole app.** The `overrides` entry in `biome.json` stops being a
  list of 70 folders. It covers `apps/web/src/**` except what is out below (the server, the API,
  tests and the styleguide), so a new screen is covered from its first commit. First an
  inventory of what the list does not reach today (`app/layout.tsx`, the routes under
  `app/(app)/workspaces/[name]/items`, `app/language`, `app/(app)/current-workspace`, any
  folder added since 132); then each hit is a message or a documented `biome-ignore`.
- **Stronger English-leak checks.** Today a message equal to its English is skipped, so a
  pt or fr text that is *partly* English passes every test (found in 132). Add a check for
  untranslated *fragments*: a pt or fr message that contains a run of English function words
  ("the", "and", "with", "your"…) is listed, and fails unless it is on a short reviewed
  allowlist (product names, code, a quoted label). The e2e `noEnglish` scan is one shared
  helper that splits on newlines **and tabs** (132 fixed this in its own specs); the older
  language specs (browse, author, 130/131) use it, and the Account, Home, Feedback and Sign-in
  e2e do too.
- **The phone sweep in every language.** `MIGRATED_ROUTES` goes: every page in the sweep runs in
  Portuguese and French on a phone (320px) as well as English, signed in and signed out, with the
  styleguide as the one exception. The pinned list in `pages-coverage.test.ts` becomes "every
  page file is in the sweep or in a short list of exceptions with a reason".
- **Documentation links checked.** Every `Help` link and every "Learn more" or Documentation
  link in the app opens a topic and section that exist on the website in all three languages.
  A test reads ronne-web's `topics.ts` and its pages when the sibling repository is present
  (skipped, with a message, when it isn't) and the release runbook gains a step that opens the
  links on the deployed site in each language.
- **Website wording agrees with the app** (owner, 2026-10-23, moved from 131). One rule each in
  ronne-web's translation guide, then every pt and fr page follows it: French prose says
  « révision » (not « revue ») for a review, and pt/fr prose says "proposta de alteração" /
  « proposition de modification » (not "mudança" / « changement »). Also what 132 left in the
  Documentation: the item page's **Overview** tab (Visão geral / Aperçu), the Review page's
  **Status** column and the export dialog's **Cancel**; and a read of the website's French for
  Canadian-French register against the app's (129's open note).
- **The language review.** A readable export of every message, English beside Portuguese
  and French, by namespace, with the key and the screen it appears on (a script, `pnpm
  i18n:review`). Reviewer agents (owner, 2026-10-27), one per language and part (four each: the
  most-seen screens, authoring and errors, admin and help, the website), each set up as a
  native-level technical editor of pt-BR or fr-CA who did not write the drafts, go through it and
  the website's pt and fr pages; their findings are triaged and applied, with the glossary and the
  translation guide updated where a rule is behind a correction, and a change to a glossary word
  goes to the owner. The findings and what was done with each are recorded in `REVIEW.md` in this
  folder. A read by native speakers stays possible later with the same kit (`REVIEW-GUIDE.md`).
- **The decisions 132 left open**, taken with the owner on 2026-10-27 and recorded in the spec
  (Open questions) and the decision log: the styleguide stays English, there is no instance default
  language, and the text the server writes stays English (see Out).

**Out** (and where it goes instead):
- **The styleguide** stays English and out of the rule (owner, 2026-10-27).
- **Text the server, a driver or `@ronneai/core` writes** (core's validation and risk messages,
  the identity domain's OIDC presets and test results, the setup's database check and a driver's
  own message): English, as decided in 131 and 132 and confirmed by the owner on 2026-10-27, and
  listed in the Documentation. If any of it should move, it becomes its own feature, not part of
  the sign-off.
- **More languages**: a new message folder and a row in the language list (129).
- **An identity provider's language claim** setting a person's language (129's open question):
  left out until someone asks.
- **Item content**, what people write, `rmk`, the MCP server and the API: as authored.
- **Unrelated test flakes** (`health.db.test.ts`, `storage-names.test.ts`, `redact.test.ts` under
  load): not about languages.

## Behaviour

- **A new screen is checked from its first commit.** A file under `apps/web/src` that writes
  text straight into JSX or a labelled attribute fails `pnpm lint`, in any folder.
- **The fragment check is a guard, not a judge.** It reports a message with its key and the
  words it saw, so a reviewer decides. The allowlist is a file with a reason per entry; a new
  entry is a reviewed change.
- **A link to the Documentation** lands in the person's language, on a section that exists. A
  helper whose section was renamed fails the links check, not a reader.
- **The review export** is generated from the message files, never edited by hand; a correction
  is made in the message file and the export is regenerated.

## Edge cases

- A route that renders no text of its own (a redirect, an API-like route) is not in the sweep and
  is on the exceptions list with that reason.
- A message that is the same word in every language ("Root", "Token") is on the SAME tables that
  `admin-untranslated` and `help-untranslated` already use, and is not a fragment hit.
- A pt or fr message that quotes English on purpose (a command, a tool's menu path, a seeded
  value) carries the quoted part in `<code>` or the allowlist, with the reason.
- The website's pages quote the app's labels with a straight apostrophe (the guide's rule);
  the check for wording compares after normalising it.
- The sibling repository is absent in CI: the links test says it skipped and why; the release
  runbook step covers the deployed site.

## Documentation

- **ronne-web:** `docs/translation-guide.md` gets the two wording rules and the Canadian-French
  note; pt and fr pages follow them and name the Overview tab, Status column and Cancel button
  as the app does; corrections from the language review. No new topic or section. A branch
  `feat/133-languages-signoff` goes live with the release.
- **In the app:** no new helper; helpers whose text a reviewer corrects change in `help.json`.
- `docs/knowledge/i18n.md`: the rule covers the whole app; the fragment check and the allowlist;
  the review export; the glossary gains whatever the review settles.
- `docs/runbooks/release.md`: the step that opens the Documentation links in each language.

## Acceptance criteria

- [x] `pnpm lint` fails on raw text in any file of `apps/web/src` outside the stated exclusions;
      the `overrides` list of folders is gone; the app passes.
- [x] A pt or fr message with an untranslated run of English fails a test unless allowlisted,
      and the allowlist has a reason for each entry.
- [x] One shared e2e helper scans for English across newlines and tabs, and every language spec
      uses it; planting English in a table cell of a page fails its spec.
- [x] The phone sweep runs every page in English, Portuguese and French; `MIGRATED_ROUTES` is gone.
- [x] Every Documentation link in the app opens an existing topic and section in all three
      languages (test with the sibling repository; release step for the deployed site).
- [x] The website uses « révision » and "proposta de alteração" / « proposition de modification »
      consistently, and names the Overview tab, Status column and Cancel button as the app does.
- [x] Reviewer agents for Portuguese and for French have read the app's messages and the
      website's pages; every finding is applied, kept with a reason or sent to the owner in
      `REVIEW.md`.
- [x] The owner has decided the styleguide, the default language and the server-written text, and
      the decision log says so.
- [x] The key-parity, placeholder and "untranslated" tests pass; the e2e project is green on a
      fresh build.

## Decisions

- **The rule covers the whole app by default and names its exceptions**, instead of listing the
  folders that comply, so a forgotten folder cannot stay English silently.
- **Fragments are reported, not auto-fixed**: only a reader of the language can say that "Login" or "token"
  is right in a Portuguese sentence.
- **The review is done by agents, not people** (owner, 2026-10-27). It is a model reading a
  model's drafts, so it catches wrong meaning, grammar, register, typography and inconsistency,
  but not reliably what only a native speaker hears; a human read stays optional, with the same
  kit. The witness can check the record and that the applied findings are in the files, not that
  the reading was good.

## Open questions

Answered by the owner on 2026-10-27 (and recorded in MVP §15, Languages):

- **The styleguide** stays English and outside the rule (a developer reference).
- **An instance default language** is not built; it can be its own feature if someone asks.
- **Text the server, a driver or `@ronneai/core` writes** stays English; if some of it should move, it
  becomes its own feature.
- **Who reviews each language?** Reviewer agents (owner, 2026-10-27); a native read stays
  optional and later.
