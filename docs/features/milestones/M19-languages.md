# M19 — Languages

> [All milestones](README.md) · [Features index](../README.md)

The screens speak the person's language: English (the default), Portuguese and French, chosen on
the profile (owner, 2026-10-20). Platform labels only: item content, what people write, `rmk`, the
MCP server and the API stay as they are. 129 builds the machinery and translates what every page
shares; 130–133 move the rest, area by area, and stay `planned` until 129 is built, so their specs
use what it taught. From 129 on every new screen is written with messages.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [129](../web-ui/129-languages-foundation/SPEC.md) | Languages, the foundation: `user.locale`, how the language is chosen (profile, cookie, browser, English), message files with parity and raw-text tests, the shell, Account, sign-in and shared UI in three languages | 006, 032, 049, 088, 104, 123 | done |
| [130](../web-ui/130-languages-browse/SPEC.md) | Languages: browse. Catalogue, item page, workspaces pages (members, requests, moves), the words they share (item types, roles), what their actions say, and the inline helpers that sit on them | 129 | done (the Documentation in ronne-web `docs/marketplace-languages-browse`) |
| [131](../web-ui/131-languages-author/SPEC.md) | Languages: author and review. Draft editor, composer, submissions, reviews, versions, releases and their error messages | 129, 130 | done |
| [132](../web-ui/132-languages-admin/SPEC.md) | Languages: admin and setup. Admin pages, settings tabs, audit log labels, the setup wizard, SSO and SCIM screens; an instance default language if wanted | 129 | done (the Documentation in ronne-web `feat/132-languages-admin`; the instance default language was not built) |
| [133](../web-ui/133-languages-signoff/SPEC.md) | Languages: sign-off. The raw-text scan covers the whole app, a language review of Portuguese and French (by agents, owner 2026-10-27) (with 131's follow-up: « revue » and "proposta de mudança" on the website), the phone sweep in each language, Documentation links checked | 130, 131, 132 | done (reviewed by agents; the Documentation in ronne-web `feat/133-languages-signoff`) |
| [141](../web-ui/141-language-settings/SPEC.md) | Languages on and off, and the instance default: Admin › Settings › Languages sets the default, whether people may choose and which languages are offered; with choosing off everyone sees the default and the switches hide; the default replaces English as the last fallback; people's choices are kept; audited | 129, 132, 122, 007 | done (the Documentation in ronne-web `docs/marketplace-141-language-settings`) |
