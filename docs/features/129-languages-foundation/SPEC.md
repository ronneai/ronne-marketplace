# 129 — Languages: the foundation

> Milestone: M19 · Depends on: 006, 032, 049, 088, 104, 123 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) · Contracts: none changed (the web app only; the API, `rmk` and MCP stay in English)

## Goal

Ronne's screens speak the person's language. This feature builds the machinery (message files, how
the language is chosen, where it's saved) and translates the parts every page shares: the sidebar
and menus, Account, sign-in and the shared UI pieces. **English** is the default; **Portuguese**
and **French** are added. The rest of the screens move over in 130–133, and from this feature on
every new screen is written with messages from the start.

## Scope

**In:**
- **Three languages:** `en` (default, the source of every text), `pt` (Brazilian Portuguese) and `fr`
  (Canadian French, owner, 2026-10-20; the privacy features follow Quebec's Law 25). Each is shown in its own name
  everywhere (English, Português, Français), so someone in the wrong language can find theirs.
- **A language on the profile.** `user.locale` (`en`, `pt`, `fr` or empty, empty meaning
  "automatic"), chosen on Account → **Language**: Automatic (the browser's), English, Português,
  Français. Saving it is a server action; it takes effect on the next render, no sign-out.
- **How the language is chosen, on every request,** first match wins:
  1. the signed-in person's saved language;
  2. the `ronne-locale` cookie (set when they choose a language, and by the links below);
  3. the browser's `Accept-Language`, the best match among the three;
  4. English.
- **Before sign-in:** the sign-in, setup and device pages use steps 2–4, and carry a small
  language switch (links, working without JavaScript) that sets the cookie.
- **The machinery:** `next-intl` (MIT; the ronne-web site already uses it, so the format and the
  tooling are the same), without language prefixes in the URL: a person's language is theirs, not a
  page's, and links stay the same for everyone. Message files are
  `apps/web/messages/<locale>/<namespace>.json`, one file per feature folder's namespace, merged
  when the request starts. Text with numbers and plurals uses ICU messages (`{count, plural, …}`),
  never string joins.
- **What is translated (platform labels only):** headings, buttons, field labels, placeholders,
  helper text, empty states, validation and error messages the web app shows, page titles
  (`<title>`), `aria-label`s, and `<html lang>`. Dates, times and numbers follow the language
  (`Intl`; 049's local time keeps its UTC on hover).
- **What is not translated, by design:**
  - **Item content:** names, descriptions, READMEs, files, manifests, keywords, version notes.
  - **What people write:** review comments, workspace and scope descriptions, the instance notice
    (124), feedback (127), user names.
  - **Technical identifiers:** item types in code (`skill`), dist-tags, audit action codes,
    commands, file paths, error codes.
  - **Other surfaces:** `rmk`, the MCP server, `/api/v1` messages and the plugin feeds stay in
    English. The API keeps returning an error code plus an English message; the web app shows the
    code's translation and falls back to the English message.
- **Which screens move in this feature:** the sidebar, the Menu sheet and the account menu (119,
  066), the workspace switcher's own labels, Account (profile, password, two-factor, Language),
  sign-in, the device page, the setup wizard's language links only (its text moves in 132), the
  shared pieces in `components/ui` (Copy, dialogs' Close, tables' Sort and paging, Notice defaults,
  LocalTime, empty states), the 404 and error pages, and the Help popover's frame ("Learn more",
  "Close").
- **"Learn more" links** open the website's Documentation in the person's language (the website
  already has English, Portuguese and French, 088).
- **Guards, so it stays true:** a test that every key in English exists in Portuguese and French
  and the other way round, with the same ICU placeholders; a lint rule (five Biome plugins,
  `packages/config/biome-plugins/i18n-raw-jsx-*.grit`, which `pnpm lint`, the pre-commit hook and CI
  run) that fails on text written straight into JSX, or into a `title`, `label`, `placeholder`,
  `aria-label`, `alt`, `description`, `summary`, `heading` or `tooltip` attribute, in the migrated
  folders (the list is the `overrides` entry in `biome.json`, which grows in each sweep; 133 makes
  it the whole app). Text inside `<code>`, `<pre>` and `<kbd>`, punctuation and numbers are fine; a
  string that is not translated text, such as a brand name or a protocol, carries
  `biome-ignore lint/plugin: <why>`. The rule is tested on fixtures. A missing
  translation falls back to English at run time (never a raw key on screen) and fails CI.

**Out** (and where it goes instead):
- Translating the remaining screens: catalogue and item page (130), drafts, submissions, reviews,
  versions and releases (131), admin, settings, setup and the rest of the helpers (132), sign-off
  (133).
- More languages: adding one is a new message folder, a row in the language list and the website
  having it; no feature is needed.
- An instance default language that root sets, and SCIM's `preferredLanguage` setting a person's
  language: see Open questions.
- Right-to-left layouts: none of the three languages needs it.
- Translating item content, with machine translation or by hand: not planned.

## Behaviour

- **Choosing.** Account → Language is a select with a Save button, like the rest of the page; it
  explains in one line that this changes Ronne's screens, not what people publish. Saving sets the
  cookie too, so the sign-in page on this browser follows. Choosing Automatic clears the saved
  value (and keeps the cookie off), so the browser decides again.
- **A signed-out choice** (the switch on sign-in) only sets the cookie. After sign-in, the saved
  language wins; with none saved, the cookie keeps applying and nothing is saved until the person
  chooses on Account.
- **One language per request.** Server components, server actions' messages and the client
  provider all get the same locale from one function (`resolveLocale`), so a page never mixes two.
- **Plurals and gender-neutral wording.** Messages are whole sentences with placeholders, not
  fragments; Portuguese and French plural rules come from ICU. Texts avoid addressing the person by
  gender.
- **Brand and product words stay:** Ronne, rmk, MCP, Claude Code, Codex and Cursor, and the item
  type names where they are also what `rmk` prints (skill, agent…) are kept in English inside a
  translated sentence, with the type's translated label shown beside them where a label exists
  (a glossary file `docs/knowledge/i18n.md` lists each choice, so the three languages stay
  consistent).
- **Server messages.** Services keep throwing their English errors (the API contract). The web
  layer maps a known error code to `errors.<code>` and shows it, else the English text. An
  inventory of the codes and the messages with variable parts is task 1 of the plan.
- **Time zones are unchanged** (049): the language changes how dates read ("20 oct. 2026"), never
  which instant.

## Edge cases

- A saved language the app no longer supports (a removed one) counts as Automatic.
- `Accept-Language: pt-PT` matches `pt`; `fr-CA` matches `fr`; `es` matches nothing and falls to
  English. Quality values are respected.
- The cookie is a preference, not trust: it is validated against the three codes on every request.
- A person with JavaScript off can still change language (Account is a form; the sign-in switch is
  links).
- Erasing a user (103) deletes nothing extra here; the downloaded data (104) includes the saved
  language.
- SCIM-provisioned and SSO accounts start with Automatic.
- A very long translation (French) must not break layouts: the phone sweep (075) runs in each
  language for the migrated pages.

## Documentation

- **Account** (`account.tsx`): a new section **Language** (`account#language`): the three
  languages, how it is chosen (saved language, browser, English), what is and isn't translated,
  that `rmk` stays English.
- **Overview → Finding your way:** one sentence that the screens come in three languages, linking
  to the section.
- **Helpers:** next to the Language select, "What changes?" → `account#language`.
- Both `topics.ts` get the new section. The website already has the three languages, so only the
  words of the new section are written in each.

## Acceptance criteria

- [ ] `user.locale` exists on all three database kinds, is returned with the session user, and
      appears in "Your data" (104) and in the user page (123, read-only).
- [ ] The language is chosen in the order saved language, cookie, `Accept-Language`, English, with
      tests for each step, for `pt-PT`/`fr-CA`/`es`, a stale cookie and a removed saved value.
- [ ] Account → Language saves the choice (with and without JavaScript); sign-in, setup and device
      pages have the switch; `<html lang>` matches.
- [ ] The listed screens render in English, Portuguese and French with no key or English text left
      over, on desktop and phone.
- [ ] The key-parity and placeholder tests pass, and the raw-text scan passes on the migrated
      folders and fails on a deliberate sample.
- [ ] "Learn more" links open the website in the person's language.
- [ ] Dates and numbers follow the language; UTC on hover is unchanged.
- [ ] CLAUDE.md, the new `docs/knowledge/i18n.md` (glossary, how to add a message, how to add a
      language) and MVP §15 record the rule: UI text goes through messages.
- [ ] The Documentation and helpers above say what the feature does now.

## Decisions

- **Per person, not per URL** (2026-10-20): the language is in the profile, so shared links look
  the same to everyone and no route is duplicated. The website, a public site, uses prefixes; the
  app, behind sign-in, doesn't need them.
- **Platform labels only** (owner, 2026-10-20): content stays as authored.
- **Brazilian Portuguese and Canadian French** (owner, 2026-10-20). The codes stay `pt` and `fr`.
- **Build this before the new Home work** (124–128): every string written before it is a string to
  extract later.

## Open questions

- **Website wording.** The website's French may be more neutral than Canadian French; check the
  two read consistently when the Documentation links open.
- **An instance default language** (root sets it, used when the browser gives no match): small, but
  not needed to start. Add as a setting in 132 if wanted.
- **SCIM and SSO:** should an identity provider's language claim set the saved language on first
  sign-in? Left out until someone asks.
- **Who reviews the translations.** The first drafts can be machine-made; a native reader should
  check them in 133.
