# 088 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Links to the website.** `docsHref` gives website addresses; Docs (header and Menu) and
  Learn more open in a new tab with the icon and the screen-reader text.
  *Done when:* the help, shell and feature tests pass with website addresses.

- [x] **2. Remove the Documentation pages.** `/docs`, `/docs/<topic>` and `features/docs` go; both
  addresses redirect (307) to the website; the end-to-end tests stop visiting them.
  *Done when:* nothing imports `features/docs`, and the redirects answer on a production build.

- [x] **3. The install address.** `https://www.ronne.ai/marketplace/install.sh` and `install.ps1`
  everywhere in this repository.
  *Done when:* no `ronne.ai/install.` is left outside history (081's plan notes keep theirs: they
  record what was done then).

- [x] **4. The rules.** `CLAUDE.md`, the features index's rule 4 and 033's spec point at the
  website's repository for the Documentation.
  *Done when:* they agree with this spec.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
