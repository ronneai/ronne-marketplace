# 141 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [x] **1. Decision.**
  - MVP.md §15's "Languages" row says root sets the default, the switch and the offered languages,
    132's spec points here for the instance default, and `docs/features/README.md` lists 141 under
    M19 with its dependencies.
  - *Done when:* the docs say what this spec says, and `pnpm witness:check` passes.

- [x] **2. Choosing with the instance's settings.**
  - `chooseLocale` with `offered` and `fallback`; the settings model and service
    (`language_default`, `language_choice`, `language_offered`, the default always offered);
    `requestLocale` reads them once per request, falling back as today when it can't.
  - *Done when:* unit tests cover choosing off, each step with choosing on, a language not offered
    at each step and the absent settings; db tests cover the settings service on SQLite.

- [x] **3. Settings › Languages.**
  - The tab in 122's strip, the form, the audit event `settings.languages`.
  - *Done when:* component tests cover the default's locked box, the switch hiding the list and the
    "reads as off" note; a db test covers the audit metadata.

- [x] **4. What hides when choosing is off.**
  - Account › Language, `LanguageSwitch` on sign-in, two-factor and setup; the note for a saved
    language no longer offered.
  - *Done when:* component tests cover both states; an e2e test turns choosing off with French as
    the default and sees the sign-in page and Account in French with no language links.

- [ ] **5. Messages.**
  - Every new key in `en`, `pt` and `fr`.
  - *Done when:* the parity and raw-text tests pass; the phone sweep passes on the tab.

- [ ] **6. Documentation.**
  - `account#language`, the new `settings#languages` section, the helper, `docs/knowledge/i18n.md`;
    `topics.ts` here and in ronne-web together.
  - *Done when:* the docs render tests and `pnpm docs:links` pass, and the helper lands on a real
    section.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
