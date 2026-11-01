# 141 — Languages on and off, and the instance's default

> Milestone: M19 (follow-up) · Depends on: 129, 132, 122, 007 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Languages"), [129 SPEC](../129-languages-foundation/SPEC.md), [132 SPEC](../132-languages-admin/SPEC.md) (the instance default it left out) · Contracts: none changed

## Goal

Root decides whether people may choose the language of the screens, which language everyone starts
in, and, when choosing is on, which languages are offered (owner, 2026-10-29). Today every instance
offers English, Portuguese and French, and English is the fallback; 132 left the instance default
unbuilt until someone asked.

## Scope

**In:**
- **Admin › Settings › Languages**, a new tab (122):
  - **Default language:** English, Português or Français (`LOCALES`), English by default;
  - **Let people choose their language:** a switch, on by default (as today);
  - **Offered languages**, shown while the switch is on: a checkbox per language; the default is
    always offered and its box can't be cleared; at least one other must be ticked for choosing to
    mean anything (else the switch reads as off, and the tab says so).
- **How the language is chosen** (`chooseLocale` in `i18n/locale.ts`), with the instance's settings:
  - **choosing off:** everyone sees the default language; `user.locale`, the cookie and the browser
    are ignored;
  - **choosing on:** the saved language if it's offered, else the cookie's if offered, else the best
    offered match for the browser, else **the default** (instead of English).
- **What hides when choosing is off:** Account › Language, and the language links on the sign-in,
  two-factor and setup pages (`LanguageSwitch`). The `/language` route answers as now but sets
  nothing a person would see.
- **A language turned off keeps people's choice:** `user.locale` isn't cleared, so turning it back on
  brings it back.
- **Before setup and when the database doesn't answer:** no settings can be read, so it works as
  today (every language, English last), and the setup wizard still speaks the browser's.
- **Audit:** `settings.languages` with the default, the switch and the offered list.

**Out** (and where it goes instead):
- **New languages** (Spanish, German…): adding one is a code change (`docs/knowledge/i18n.md`,
  "Adding a language"); the tab lists what the build has.
- **A language per workspace:** no; languages are per person, within what the instance offers.
- **Item content, `rmk`, the MCP server and the API:** they stay as authored (MVP §15, "Languages").
- **Choosing the default in the setup wizard:** later, if asked; root sets it after setup.
- **The Documentation's language:** the website keeps its own switch (088); the helpers' links
  follow the screen's language as now.

## Behaviour

**From root's side.** A company in Quebec sets French as the default and turns choosing off: every
screen is in French, Account has no Language section, and the sign-in page has no language links.
Later it turns choosing on with French and English offered: a person whose browser asks for English
gets English, one who asks for Portuguese gets French (not offered, so the default).

**For the code.**
- `chooseLocale` takes two more inputs, `offered` (the languages allowed) and `fallback` (the
  default), with today's values when absent, so the setup and error paths keep calling it as now.
- `requestLocale` (`i18n/server.ts`) reads the settings once per request (`cache`) through the
  settings domain, inside the same `try` that reads the session.
- `instance_settings` rows: `language_default`, `language_choice` (`on`/`off`),
  `language_offered` (a JSON list).
- `<html lang>` follows the chosen language, as now.

## Edge cases

- **The default isn't in the offered list** (a hand edit): it's added when read.
- **A saved `user.locale` of a language no longer offered:** ignored, not changed; Account › Language
  shows "Automatic" selected and a note that their earlier choice isn't offered now.
- **The cookie from before the change:** ignored when not offered; it isn't rewritten.
- **Root's own screens:** follow the same rules; root changes the setting, not their own exception.
- **Two roots save at once:** the last one wins; each save is audited.

## Data

`instance_settings` rows above; no migration.

## Documentation

- **Account** (`account#language`): which language you see, and that your instance may fix it or
  offer fewer languages.
- **Settings** (`settings`): a new section, `languages` ("Languages"): the default, the switch, the
  offered languages, what people see when choosing is off.
- **Helpers:** the tab's "What do people see when choosing is off?" → `settings#languages`.
- `docs/knowledge/i18n.md`: the order now includes the instance's settings.

## Acceptance criteria

- [x] Root sets the default, the switch and the offered languages in Settings › Languages; the
  default is always offered; each save is audited.
- [x] With choosing off, every page (signed in or not, after setup) is in the default language, and
  the Language section and the language links are gone.
- [x] With choosing on, the saved, cookie and browser languages count only when offered, and the
  default replaces English as the last step; unit tests cover each step of `chooseLocale`.
- [x] A turned-off language leaves `user.locale` as it was; turning it on again restores it.
- [x] Before setup, and with the database down, the language is chosen as today.
- [x] Every new text is a message in English, Portuguese and French; the tab passes the phone sweep.
- [x] The Documentation and inline helpers listed above say what the feature does.

## Decisions

1. **Root can turn choosing off, set the default and pick the offered languages** (owner,
   2026-10-29). This builds what 132 left out.
2. **The default replaces English as the last step, not the first** (Claude): a person's own choice
   still wins while choosing is on.
3. **Choices are kept, not cleared** (Claude): turning a language off and on again shouldn't undo
   what people chose.

## Open questions

- Should the setup wizard ask for the default language, so the first root's screens start in it?
