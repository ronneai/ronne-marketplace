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

## Tasks 3 and 4: the install address and the rules (2026-10-05)

| Check | Result | Evidence |
|---|---|---|
| No old install address left | confirmed | `git grep "ronne.ai/install"` finds only 081's dated plan note and this plan's own text; 13 `…/marketplace/install.sh` and 9 `…/install.ps1`, no other spellings; every edited sentence reads right; the sh and PowerShell usage lines are still valid; `pnpm test:install` passes under dash and bash, and no test asserts the address |
| Website links in the READMEs | confirmed | `rmk`, `export` and `mcp` exist in both `topics.ts` files, with the same titles; ronne-web's `www/src/content/docs/` exists (en, pt, fr, `topics.ts`) |
| The rules agree | confirmed | CLAUDE.md, the index's rule 4, the spec template and 033's note say the same, and match this spec; the MVP §15 row fits its three columns |
| Unfinished features | found, fixed | 068, 069, 070, 071, 072 and 075 (all `specified`) still said to edit `content.tsx` or the `/docs` pages: each spec and plan now has a "Since 088" note. Finished features keep their history |
| Packaging | confirmed | `packs.js` checks file names, not README text; `pnpm lint` has no errors; repo-tools' 105 tests pass |
| The website's side (ronne-web 69ddf68, PR #8) | confirmed | Four redirects, all 307 to the latest release's scripts, checked on `next dev`; `/marketplace` still goes to `/en/marketplace`; its test covers all four. Rebasing `feature/010-011-release-and-docs` has no conflicts; its `install.tsx` line 21 (en, pt, fr) then needs the new address |

**Overall:** met.
