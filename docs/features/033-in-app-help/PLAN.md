# 033 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Spec and plan.** This feature's SPEC and PLAN, and its row in the index.
  *Done when:* they're committed.

- [x] **2. Documentation shell and HelpTip.** `/docs` with its topic list and pages, the nav item,
  and the shared `HelpTip`.
  *Done when:* render tests cover the topic list, a topic page, the nav item and HelpTip.

- [x] **3. Topics.** The eight topics' content, from MVP §2–§4 and the M2–M3 specs, with the type
  descriptions shared with the New item form.
  *Done when:* render tests cover each topic's sections, and the types match the form's.

- [x] **4. Inline helpers.** HelpTips in the places the spec lists, and a test that every "Learn
  more" target exists.
  *Done when:* render tests pass, and the Playwright test in the acceptance criteria passes.

## Notes
- **Built on the recommendations (2026-09-28).** The owner started 033 without a spec; it was
  written first and built without waiting for answers: the documentation needs sign-in, and each
  topic has its own page.
- **Task 2 (2026-09-28): shell and HelpTip.** `components/help/topics.ts` lists the eight topics and
  their sections (typed slugs and section ids, `docsHref`), shared by the pages and the inline
  helpers. `/docs` is the overview and `/docs/[topic]` the rest (a 404 otherwise); the layout puts
  `DocsNav` beside the page on wide screens and above it on phones. `DocsPage` renders a topic's
  sections as anchored `<section>`s. `components/ui/HelpTip` is a `<details>` with the question, the
  answer and Learn more. Docs is in the main nav after Scopes.
- **Task 3 (2026-09-28): topics.** `features/docs/content.tsx` holds the eight topics' words by
  section id, written from how the app behaves: naming rules and the name length from core, the
  dependency table from `DEPENDENCY_TYPES`, the statuses with their badges, the tag rules, and the
  permission matrix without what isn't built (instance settings). The types table uses the New item
  form's own descriptions and risk marks: `item-types.ts` moved to `components/submissions`, shared
  by both. `rmk` is described in the future tense, as not released yet.
- **Task 4 (2026-09-28): inline helpers.** `components/help/Help.tsx` holds every helper (question,
  answer, link) in one registry, used as `<Help id="…" />`, and a test checks each link lands on a
  real topic section. They're in the New item form (scope, name, type), the manifest form, the
  submit dialog, the risk summary, the review page's decisions, the publish dialog (bump, tag), the
  Versions tab (tags, deprecate or yank) and under Propose a change; the Scopes page links to its
  topic. Render tests check each place; the dialogs' helpers are checked in the review Playwright
  test, and a new one follows "What's a scope?" to the Documentation.
- **Header order (2026-09-28, owner's request).** Admin and Docs sit at the right of the header,
  just before the appearance switch: `[Admin] [Docs] [appearance]`. They're still in the one Main
  navigation (a `NavItem` can be `end`), so there's a single landmark; on phones they come at the
  end of its sideways scroll.
- **Phones (2026-09-28).** Screenshots at 390 px: no page scrolls sideways. The topic list became a
  row that scrolls sideways on phones, instead of a full list pushing the page down.
- **Topic groups (2026-09-28, owner's request).** The menu groups the topics under labels, with a
  line between groups: Getting started (Overview, Roles), Organising (Scopes, Items and types),
  Publishing (Submitting and review, Versions and tags, Changing a published item) and Installing
  (Installing with rmk). `TOPIC_GROUPS` in `topics.ts`; a test checks each topic is in exactly one
  group. On phones the labels are hidden in the sideways row, which scrolls the current topic into
  view.
