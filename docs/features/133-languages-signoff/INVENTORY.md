# 133 — Inventory: what the raw-text rule does not reach

Taken on 2026-10-27 from `main` at 44a5d295: every `.tsx` file under `apps/web/src`, except tests,
that no entry of the `overrides` list in `biome.json` matches. (The rule reads JSX, so `.ts` files
are not in the list; their user-facing strings were moved with their screens and are checked by
each area's translation tests.)

| File | Text to move? | What task 2 does |
|---|---|---|
| `app/layout.tsx` | Yes: the static `metadata` (`title` "Ronne AI Marketplace", `description` "A self-hosted, curated registry of AI capabilities.") is the page's default and the text of a link preview. The title is a product name; the description is English in every language. | Make it `generateMetadata` with the description a message in three languages (`common`); the product name stays. |
| `app/(app)/admin/layout.tsx` | No: renders `children` after a permission check. | Nothing; covered by the whole-app rule. |
| `app/(app)/admin/page.tsx` | No: redirects (10 lines). | Nothing. |
| `app/(app)/workspaces/[name]/items/[scope]/[item]/page.tsx` | No: a thin wrapper that renders the item page (118), whose text is in `features/item-page` (covered). | Nothing. |
| `app/(app)/workspaces/[name]/items/[scope]/[item]/versions/page.tsx` | No: the same, for versions. | Nothing. |
| `app/(app)/styleguide/page.tsx` | Out: the styleguide (SPEC, Out; task 8 asks the owner). | Excluded. |
| `features/styleguide/BottomBarDemo.tsx`, `DialogDemo.tsx`, `Styleguide.tsx` | Out: the same. | Excluded. |

Files the rule never sees because they are not `.tsx` (`app/language/route.ts`,
`app/(app)/current-workspace/route.ts`, the `account/data` and `admin/users/[id]/data` routes,
`app/api/**`, `server/**`) write no screen text: they redirect, set a cookie or return data.

Result: one real hit (the root metadata description). Everything else already complies.
