# 088 — Documentation on the website

> Milestone: Across the app · Depends on: 033, 050 · Website: `../ronne-web` (its features 008 and 011)

## Goal

The Documentation lives in one place, the public website, where people find it before they install
Ronne and where it's read in English, Portuguese and French: `https://www.ronne.ai/marketplace/docs`
(owner, 2026-10-05). The app stops carrying its own copy. Its inline helpers stay, and their "Learn
more" now opens the same section on the website.

The install scripts move next to it, under `https://www.ronne.ai/marketplace/`.

## Scope

**In:**
- The **Docs** item in the header (and the phone Menu, 066) opens the website's Documentation in a
  new tab.
- Every inline helper's **Learn more** (033, 050) opens its topic and section on the website in a
  new tab, and so do the app's other links into the Documentation: **About scopes** in the New item
  form, each tool's name in an item's **Works in** tab, and **see what's sent** on the Usage card.
- The app's Documentation pages (`/docs`, `/docs/<topic>`) and their components go. Their addresses
  redirect to the website, so bookmarks and older links still land.
- The install commands use `https://www.ronne.ai/marketplace/install.sh` and `install.ps1` (the
  website's feature 008 serves both; the first addresses, `/install.sh` and `/install.ps1`, still
  work there).
- The rule that every feature keeps the Documentation current now points at the website's
  repository.

**Out:**
- The website's pages and words: `../ronne-web` (its feature 011 copied the Documentation from this
  app at 0.3.0).
- Documentation per instance (written by root), and a docs search: as before, not planned.

## Behaviour

- **The address.** `docsHref(topic, section)` gives `https://www.ronne.ai/marketplace/docs`, plus
  `/<topic>` for any topic but the overview, plus `#<section>`: the website's addresses, which mirror
  the app's. With no language in the address, the website sends each visitor to their own (English,
  Portuguese or French); the section stays in the address.
- **The topics.** `components/help/topics.ts` keeps the topics and their section ids: the website
  has the same ones, and a test checks every helper's link against them. When the website adds or
  renames a section, both change together.
- **A new tab.** Docs and Learn more open in a new tab (`target="_blank"`,
  `rel="noopener noreferrer"`), so the page someone was working on stays open. Each shows an
  external-link icon and tells screen readers "(opens in a new tab)". Docs is never the current page,
  so it's never highlighted.
- **Old addresses.** `/docs` (and `/docs/overview`) redirects to the website's Documentation, and
  `/docs/<topic>` to that topic's page there (a temporary redirect, 307), for anyone signed in or
  not: Next applies `next.config.ts`'s redirects before the sign-in check in `src/proxy.ts`. A topic
  the website doesn't have ends on the website's 404, which offers its Documentation. `rmk`'s usage
  notice prints `<instance>/docs/usage`, so the redirect stays for as long as released versions of
  `rmk` print it.
- **The install address.** The README, the install guide (`docs/runbooks/install.md`), the release
  notes and the scripts' own usage lines show `https://www.ronne.ai/marketplace/install.sh` and
  `https://www.ronne.ai/marketplace/install.ps1`.

## Edge cases

- **An instance with no internet access** (an air-gapped network): Docs and Learn more open a page
  that doesn't load. The helpers' answers still show in the app; only the longer explanation is
  missing.
- **A release before the website has a section:** the link opens the topic's page, at its top.
- **The website's Documentation describes the latest release.** An older instance can read about
  something it doesn't have yet. The website says which release it describes.

## Documentation

- The website's Documentation (in `../ronne-web`): nothing changes in its words. Its install topic
  shows the new install address; that change goes with its feature 011 branch.
- Inline helpers (`components/help/Help.tsx`): their answers stay; their links point to the
  website.
- `CLAUDE.md`, the features index (rule 4), the spec template and 033's spec: the Documentation is
  updated in `../ronne-web`, the helpers here. The unfinished features that planned changes to the
  app's Documentation pages (068–072, 075) say they're done on the website now.

## Acceptance criteria

- [x] Docs, in the header and the Menu, opens `https://www.ronne.ai/marketplace/docs` in a new tab,
      with the icon and the screen-reader text.
- [x] Every helper's Learn more is a website address whose topic and section exist in `topics.ts`
      (unit test), and opens in a new tab.
- [x] `/docs` and `/docs/<topic>` answer 307 to the website; the app has no Documentation pages
      left, and nothing imports `features/docs`.
- [x] The install commands everywhere in this repository use the `/marketplace/` address.
- [x] `CLAUDE.md`, the index's rule 4 and 033's spec say where the Documentation lives now.
- [x] Lint, typecheck, tests, build and the end-to-end tests pass.

## Open questions

- None. The owner moved the Documentation to the website and the install scripts under
  `/marketplace/`, keeping a single branch for the change (2026-10-05).
