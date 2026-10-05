# 088 — Witness

A fresh agent checks each task against the spec before it's ticked; what it found is fixed in the
same commit.

## Tasks 1 and 2: links to the website, and the Documentation pages removed (2026-10-05)

| Check | Result | Evidence |
|---|---|---|
| Every helper link lands on a real section | confirmed | The app's `TOPICS` and the website's `docsTopics` (ronne-web, feature 011) have the same slugs and section ids, in order; the website renders each section as `<section id>`, the overview at `/marketplace/docs`, the others at `/marketplace/docs/<topic>`; an address without a language redirects (307, next-intl) and the browser keeps the `#section` |
| New-tab links | confirmed | `target="_blank" rel="noopener noreferrer"` after the spread, so a caller can't override them; the icon `aria-hidden`; the name "Docs (opens in a new tab)"; Docs never `aria-current`; the Menu sheet still closes; design and touch rules pass |
| Other links into the Documentation | found, fixed | About scopes (New item form, where leaving would lose what was typed), the tools' names in Works in, and see what's sent (Usage card) went to the website in the same tab: now `NewTabLink`, with tests, and in the spec |
| The redirects | confirmed | `next.config.ts` redirects run before `src/proxy.ts` (Next's "Execution order"); `/docs/overview` before `/docs/:topic`; `/docsx`, `/api/…` and `/docs/a/b` don't match; `topics.ts` imports nothing |
| Nothing uses the deleted code | confirmed | No import of `features/docs`, `(app)/docs` or their components anywhere; only the three pages used them |
| Tests | found, fixed | Deleting `docs.test.tsx` removed HelpTip's only unit test (the closed state, the noscript answer, no Learn more without an address): now `components/ui/HelpTip.test.tsx`, with the new tab. 284 unit tests in the touched areas pass; the e2e logic reads right (`maxRedirects: 0` on Playwright 1.63, the request fixture signed out) |
| Documents | confirmed | The spec matches the code. Left for task 4: `CLAUDE.md`, the index's rule 4, 033's spec, the spec template; also the root README, MVP.md, the `rmk` and MCP READMEs, and the unfinished plans 068 and 071 that name the removed pages |

**Also:** `rmk`'s usage notice prints `<instance>/docs/usage`, which the redirect keeps working (now
in the spec). The end-to-end suite passed (85 tests: Chromium, phone, phone in WebKit, tablet).
**Not checked here:** the website's pages themselves, which are on ronne-web's unreleased branch.
**Overall:** met.
