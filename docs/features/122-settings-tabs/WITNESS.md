# 122 — Witness

Passes by the [state witness](../../knowledge/state-witness.md), newest last.

## Task 1 — `TabLinks` in `components/ui`

Witnessed: 2026-10-15 22:36 EDT, by a fresh agent (blind). Commit: 6937575f plus the working-tree diff. Machine: macOS (Darwin 27.0.0), Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | `TabLinks` exists in `components/ui`: a labelled `<nav>` of links in a `ScrollStrip`, taking `{id,label,href}[]` and the current id | no | confirmed | `TabLinks.tsx:20-37` renders `<ScrollStrip label=…>` with one `next/link` per tab; `ScrollStrip.tsx:85` renders `<nav aria-label={label}>` without a tablist role |
| 2 | The current tab alone has `aria-current="page"`, with an underline | no | confirmed | `TabLinks.tsx:30` sets it only when `tab.id === current`; class `aria-[current=page]:border-accent` is the underline; test "marks only the current tab" counts exactly 1 |
| 3 | 44px tall on a coarse pointer, and scrolls sideways | no | confirmed | `stripTab` contains `pointer-coarse:min-h-11` and `TabLinks.tsx` applies it; `ScrollStrip` supplies the scroll and fades (scrolling not checked in a browser) |
| 4 | It is a set of links, not ARIA tabs; `Tabs` is kept | no | confirmed | no `role="tab"` or `tablist` in `TabLinks.tsx`; `git diff` doesn't touch `Tabs`; `index.ts` still exports it |
| 5 | Component tests cover the links, the single current tab, an unknown current id and the coarse-pointer class | no | confirmed | `TabLinks.test.tsx` has 4 tests, one per case; `vitest run` → all pass (the coarse-pointer test checks the class string, not a rendered height) |
| 6 | Exported from `ui/index.ts` | no | confirmed | `git diff`: `export { TabLinks } from "./TabLinks";` |
| 7 | Added to the styleguide; the styleguide test passes | no | confirmed | `Styleguide.tsx` diff adds `<TabLinks label="Link tabs" …>` after `Tabs`; `vitest run src/features/styleguide` → 2 passed |
| 8 | No lint or type findings in the files this task changes | no | confirmed | `tsc --noEmit` in apps/web → clean; `biome check src/components/ui src/features/styleguide` → one warning, in `data-table/DataTable.tsx:15` (unused `isFiltered`), a file the diff doesn't touch and which was already there |

**Overall:** met.

## Task 2 — The workspace page uses it

Witnessed: 2026-10-15 22:48 EDT, by a fresh agent (blind). Commit: a7cf8230 plus the working-tree diff to `apps/web/src/app/(app)/workspaces/[name]/page.tsx`. Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | The workspace page renders its tab strip with `TabLinks` instead of the inline `ScrollStrip` + `Link` map | no | confirmed | `git diff` → `ScrollStrip`/`stripTab` imports and the inline map removed; `page.tsx:258-262` `<TabLinks label="Workspace" current={tab} tabs={…} />` |
| 2 | The markup is the same as before (no change in behaviour) | no | confirmed | `git show HEAD:…/page.tsx` against `TabLinks.tsx:26-38`: same `ScrollStrip label="Workspace"`, same class (`cn` drops the undefined `className`), same key, href, `aria-current` and class string per `Link` |
| 3 | The workspace page's unit tests pass, unchanged | no | confirmed | only `page.tsx` changed; `vitest run workspace` → 31 files, 319 passed, 2 skipped; `admin-workspaces.test.tsx` asserts `aria-current="page"` on the Members and Scopes tabs |
| 4 | The existing e2e tests for its tabs pass, unchanged | no | confirmed | `pnpm test:e2e` → `next build` on the working tree, then 144 passed (3.6m), none failed or flaky; `user-admin.e2e.ts:176,218` use the "Workspace" navigation |
| 5 | The changed file passes lint | no | confirmed | `biome check …/page.tsx` → no fixes; the `Link` import is still used (`page.tsx:208`) |

**Overall:** met.

## Task 3 — Settings in tabs

Witnessed: 2026-10-15 22:55 EDT, by a fresh agent (blind). Commit: 14dc485a plus the working-tree and index diff (renames to `usage/` and `feeds/`, `page.tsx`, `admin-settings.test.tsx`, new `tabs.ts`). Machine: macOS 27.0.1, Node v24.0.0.

| # | Claim | In the notes? | Verdict | Evidence (command → what was seen) |
|---|---|---|---|---|
| 1 | No `?tab=` shows Usage (policy and minimum), covered by a test | no | confirmed | `tabs.ts:14` falls back to `"usage"`; `page.tsx:34-43`; mutating the fallback to `"feeds"` in a copy failed 2 tests |
| 2 | An unknown `?tab=` shows Usage without redirecting, covered | no | confirmed | `settingsTab` matches ids exactly; the test covers `"nope"`, `""`, `"FEEDS"` |
| 3 | `?tab=feeds` shows only the plugin feeds, covered | no | confirmed | `page.tsx:27-32`; the test asserts the feeds heading, no "Usage reporting", no `instanceSettings` call; an unconditional `instanceSettings` call in a copy failed 2 tests |
| 4 | `?tab=authentication` shows the tab with neither panel (empty until task 4) | no | confirmed | `page.tsx:33` returns `null`; removing it in a copy failed the test |
| 5 | The feeds' stats query runs on `feeds` only, covered | no | confirmed | `pluginFeedStats` only in the `feeds` branch; hoisting it in a copy failed 3 tests |
| 6 | Saving a panel keeps its tab: the actions revalidate `/admin/settings` and never redirect, covered | no | confirmed | `actions.ts` both `revalidatePath("/admin/settings")`, no redirect; the forms use `useActionState`, so the URL doesn't change; removing a revalidate in a copy failed 1 test |
| 7 | A non-root gets a 404 on every tab with no data read, covered | no | confirmed | `page.tsx:24` `notFound()` before `?tab=`; the test covers four values and asserts neither query ran; exempting `feeds` in a copy failed 2 tests |
| 8 | The panels moved under `features/admin-settings/` by tab | no | confirmed | `usage/UsagePolicyForm.tsx`, `usage/UsageMinimumForm.tsx`, `feeds/PluginFeedsPanel.tsx`; no old paths left in `apps/web/src` or `e2e` |
| 9 | Tests, lint and types pass | no | confirmed | `vitest run src/features/admin-settings` → 15 passed; `biome check` → no fixes; `pnpm --filter @ronneai/web typecheck` → exit 0 |
| 10 | The real page builds and renders (e2e, the phone sweep of `/admin/settings`) | no | confirmed | `pnpm test:e2e` → 144 passed (3.5m); the sweep visits only the bare address (the tabs' addresses are task 5) |

**Overall:** met.
