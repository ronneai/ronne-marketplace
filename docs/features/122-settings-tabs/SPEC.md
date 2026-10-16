# 122 — Settings in tabs, and the Authentication tab

> Milestone: M16 · Depends on: 046, 079, 006 · Design: [MVP §14.3](../../MVP/MVP.md#143-sso--planned-as-m16), [§8](../../MVP/MVP.md#8-web-application) · Contracts: none new

## Goal

Admin › Settings stops being one long page of unrelated panels. It gets tabs, one per area, and a
new **Authentication** tab: the place where root decides how people sign in. 105 (two-factor), 106
(identity providers) and 108 (SCIM) fill it; this feature builds the frame they plug into and puts
the usage and plugin-feed panels where they belong (owner, 2026-10-15).

## Scope

**In:**
- **Tabs on `/admin/settings`**, addressed by `?tab=`:

  | Tab | `?tab=` | Holds |
  |---|---|---|
  | Usage | `usage` (the default) | the usage policy and the usage minimum (046) |
  | Plugin feeds | `feeds` | the plugin feeds' last builds (079) |
  | Authentication | `authentication` | the sign-in methods panel (below); 105, 106 and 108 add theirs |

- **A shared link-tab strip** in `components/ui` (`TabLinks`): tabs that are links, so each has its
  own address, the browser's back button works and a link can point at one. The workspace page
  (`/workspaces/<name>`) already hand-rolls the same strip; it moves to the shared one so there is
  one.
- **The Authentication tab's first panel, Sign-in methods:** a read-only list of how people can sign
  in now. Today one line, "Email and password: on", with the note that root can always sign in this
  way. 105 and 106 add to the list; nothing here can be changed yet.
- **The tab's frame for what follows:** the tab renders an ordered list of *panels* from
  `features/admin-settings/authentication/`, each a server component with its own heading, so a
  later feature adds a panel, not a page.
- **Only the active tab's data is loaded.** The plugin feeds' stats query runs on `feeds` only.
- **A link on every place that names the settings:** the Documentation and helpers point at the
  tab they mean (`/admin/settings?tab=authentication`).

**Out** (and where it goes instead):
- Two-factor policy → 105. Identity providers, the password-sign-in policy → 106. SCIM → 108.
- Settings for admins of a workspace. Settings stay root's (`settings.manage`).
- Saving across tabs in one go. Each panel saves on its own, as today.

## Behaviour

**The page.** Root only (`settings.manage`); anyone else gets a 404, as today. The header and its
description stay. Below it, the tab strip, then the active tab's panels in a grid, as the page
shows them now.

**Choosing a tab.** `?tab=` holds `usage`, `feeds` or `authentication`. A missing or unknown value
shows Usage, without redirecting (the same rule as the workspace page). Choosing a tab navigates
(a link), like any other link on the page.

**Saving a panel** stays on the tab it was on: the server actions revalidate `/admin/settings` and
the page re-renders with the same `?tab=`.

**The strip** is the one the workspace page already has, moved to `components/ui` as `TabLinks`: a
`<nav>` of links in a `ScrollStrip` (066), an underline under the current one
(`aria-current="page"`), 44px tall on a coarse pointer, scrolling sideways on a phone rather than
squeezing the labels. It is a set of links, not ARIA tabs, since each tab is a page address; the
client-state `Tabs` stays for tabs that only switch what is shown. The styleguide shows both.

**Sign-in methods panel** (Authentication tab):

| Method | State | Note |
|---|---|---|
| Email and password | On | "Root can always sign in with a password, so a broken identity provider can't lock everyone out." |

Its heading has the inline helper `auth-methods`. Once 105 and 106 land, the panel lists the
two-factor requirement and each identity provider.

**Phones** (065): the strip scrolls sideways; the panels are the same ones as before, so nothing
else changes.

## Edge cases

- **`?tab=authentication` for someone who isn't root:** 404, like the page.
- **An old bookmark, `/admin/settings`:** shows Usage, which holds what the page's top held.
- **Two panels' state in one tab:** each panel has its own form and notice; saving one doesn't
  reset another (they're separate forms, as now).
- **JavaScript off:** the strip is links and the panels are forms, so it works.

## Documentation

- **Administration → Settings** (`admin#settings`): the three tabs and what each holds; the
  Authentication tab and its Sign-in methods panel (a short paragraph; 105 and 106 add theirs).
  Changed in ronne-web (en, pt, fr); no section id is added, so both `topics.ts` stay as they are.
- **Helpers:** `auth-methods` on the Sign-in methods heading → `admin#settings`. The existing
  `usage-policy` helper stays where it is, on the Usage tab.

## Acceptance criteria

- [ ] `/admin/settings` shows Usage by default, with the usage policy and minimum; `?tab=feeds`
  shows the plugin feeds; `?tab=authentication` shows Sign-in methods; an unknown value shows Usage.
- [ ] Each tab is a link with its own address; back and forward move between tabs.
- [ ] Saving the usage policy keeps the Usage tab; a failed save shows its error on the tab.
- [ ] The plugin feeds' stats are queried only for `feeds`.
- [ ] Anyone but root gets a 404 on every tab.
- [ ] The workspace page uses the same `TabLinks` and its tests and e2e test still pass.
- [ ] The page passes the phone sweep (065) and has no axe violations on any tab.
- [ ] The Documentation and inline helpers listed above say what the feature does now.

## Decisions

1. **Tabs, addressed by `?tab=`, not separate routes** (owner, 2026-10-15). One Settings page keeps
   one place in the nav; the address still points at a tab. The workspace page does it the same way.
2. **Usage and Plugin feeds are separate tabs** (Claude): the usage policy and the feed builds
   have nothing in common, and the feed query is the slow one.
3. **Authentication is a tab of Settings, not its own admin page** (owner, 2026-10-15).

## Open questions

None.
