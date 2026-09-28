# 033 — In-app help

> Milestone: M3 · Depends on: 012, 013 (and the M3 features it explains: 014–018) · Design: [MVP §2](../../MVP/MVP.md#2-personas--roles), [§3](../../MVP/MVP.md#3-core-concepts), [§4](../../MVP/MVP.md#4-workflows), [§8](../../MVP/MVP.md#8-web-application)

## Goal

People understand how the registry works and is organised without leaving it: a **Documentation**
section explains the concepts once, and short **inline helpers** answer the question right where it
comes up ("What's a scope?", "Which type is this?", "Patch, minor or major?"), each linking to the
full explanation.

It started from the owner's question about what a scope is (2026-09-27): the answer, with examples,
should be in the app.

## Scope

**In:**
- **Documentation** (`/docs`) in the main nav, at the right next to Admin and the appearance switch:
  an overview and one page per topic.
- A shared **HelpTip**: a short explanation that opens in place, with a "Learn more" link to its
  topic.
- Inline helpers in the places people get stuck, listed below.

**Out:**
- Documentation for `rmk` commands and install in AI tools beyond what exists: M4 (019–023) adds it
  with the CLI. The page says `rmk` isn't released yet.
- A search box over the documentation, and translations.
- Instance-specific documentation written by root.

## Behaviour

**Documentation** (`/docs`, everyone signed in, like every other page):
- A topic list (a sidebar on wide screens, a row that scrolls sideways at the top on phones) and
  the topic's page.
- **Topics:**
  - **Overview:** what Ronne is, and the path of an item: draft → review → release → install.
  - **Scopes:** what a scope is (`@team/code-reviewer`), who creates them (root), who may propose in
    one (anyone: review is the gate), naming rules, and examples of ways to organise them (by team,
    by domain, `@platform` for shared basics).
  - **Items and types:** the 11 types with what each is for, in the same words the New item form uses,
    marked high-risk where review flags them; which types may depend on which; `ronne.yaml` and the
    item's files.
  - **Submitting and review:** statuses (draft, submitted, changes requested, approved, rejected,
    withdrawn, published) and what moves an item between them; the checks at submit; what reviewers
    look at (risk flags, the diff); one approval by a moderator or root who isn't the author; root's
    audited override.
  - **Versions and tags:** semver, what patch, minor and major mean for an item, pre-releases,
    dist-tags (`latest`, `next`), deprecating (warns) and yanking (stops new installs, lockfiles
    keep working); versions never change once published.
  - **Changing a published item:** proposals, stale, rebase and conflicts, the suggested bump.
  - **Roles:** user, moderator and root, as MVP §2's permission matrix.
  - **Installing with `rmk`:** what it will do, with the command shown on item pages, and that it
    isn't released yet (M4).
- Examples are the real forms and values the app uses (names, statuses, tags), never invented
  products or numbers.

**HelpTip** (`components/ui/HelpTip`): a `<details>` with a short question as its summary, such as
"What's a scope?", and 1–3 sentences plus **Learn more** to its topic's section. It works without
JavaScript, is keyboard accessible, and stays closed until asked.

**Where inline help goes:**
- **New item form:** the scope ("What's a scope?"), the name (rules and examples) and the type
  ("Which type?").
- **Draft editor:** `ronne.yaml` ("What goes in ronne.yaml?").
- **Submit dialog:** what happens after submitting.
- **Review page:** risk flags ("Why flagged?") and the decisions ("What do these do?").
- **Publish dialog:** the bump ("Patch, minor or major?") and the tag ("What's a tag?").
- **Versions tab:** deprecate and yank ("Deprecate or yank?").
- **Item page:** "Propose a change" ("What happens when I propose a change?").
- **Scopes page:** a line under the heading that links to the Scopes topic.

## Edge cases

- **A helper's topic moves:** links use the topic's slug and a section id; a render test checks every
  "Learn more" target exists.
- **Phones:** the topic list stacks above the page; no page scrolls sideways.

## Acceptance criteria

- [x] `/docs` lists every topic, and each topic page renders its sections, for everyone signed in; Docs is in the main nav.
- [x] The Items and types topic shows all 11 types with the same descriptions as the New item form.
- [x] HelpTip works without JavaScript, and every "Learn more" link points at an existing topic section.
- [x] Inline helpers appear in each place listed above.
- [x] Playwright: a user opens "What's a scope?" in the New item form, follows Learn more to the Scopes topic, and moves to another topic from the list.

## Open questions

The owner started 033 (2026-09-28) before this spec existed, so it's built on the recommendations;
either can still change.

1. **Documentation needs sign-in** (recommended: every page does, and the proxy requires a session),
   or it's public.
2. **One page per topic** (recommended: shorter pages, a URL per topic) or one long page with
   anchors.
