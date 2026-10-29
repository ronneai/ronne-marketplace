# 138 — Toasts for the results of actions

> Milestone: M21 · Depends on: 032, 065, 067, 129 · Design: [MVP §15](../../MVP/MVP.md#15-decision-log) ("Toasts"), [032 SPEC](../032-design-system/SPEC.md) · Contracts: none changed

## Goal

When an action works ("Saved", "Released 3 items", "Token revoked"), the person sees a short message
at the bottom right of the screen that goes away by itself, instead of a notice box pushed into the
page or the dialog (owner, 2026-10-29). Today every result is a `Notice` drawn from the action's
`state.done` (26 components) or a page that redirects with nothing said at all.

## Scope

**In:**
- **A toast region**, mounted once in the root layout so every page has it (the app, sign-in, setup):
  - bottom right from `sm` up, 16px from the edges;
  - below `sm`, across the bottom with the 16px side gutter, above a `BottomBar` (067) when the page
    has one, and above the home indicator (`env(safe-area-inset-bottom)`);
  - at most three toasts at once; a fourth pushes out the oldest that isn't an error.
- **Kinds and tones**, from `components/ui/tones.ts` and the tokens only: `ok` (teal, the default),
  `info` (the light blue), `warning` (amber), `error` (red). Flat: a hairline border, no shadow, the
  `Notice`'s mono prefix (`OK:`, `INFO:`, `WARN:`, `ERR:`) so the kind isn't told by colour alone.
- **How long they stay:**
  - `ok` and `info`: 5 seconds, paused while the pointer is over the region or focus is inside it,
    and while the tab is hidden;
  - `warning` and `error`: until closed;
  - every toast has a close button (`IconButton`, a 44px tap area on a coarse pointer, 067).
- **Accessibility:**
  - the region is always in the page, empty when idle, so screen readers announce what is added;
  - `ok` and `info` in a `role="status"` (`aria-live="polite"`) list, `warning` and `error` in a
    `role="alert"` one;
  - a toast never takes focus; the region is named ("Notifications") and reachable with Tab after
    the page's content;
  - `prefers-reduced-motion`: they appear and go without sliding.
- **Two ways to show one:**
  - **in the browser:** `useToast()` → `toast.ok(message)` and the others, for client components
    after an action returns (`useActionState`'s `state.done`);
  - **after a server action that redirects:** `flashToast(key, params)` on the server sets a
    short-lived cookie (`ronne-toast`, 30 seconds, `SameSite=Lax`, path `/`) holding a message key and
    its ICU parameters, never text. The next page's `FlashToast` reads it once, shows the message in
    the reader's language and deletes the cookie.
- **The sweep:** each success `Notice` that only confirms a finished action becomes a toast, and so
  does each error of an action that has no form to put it next to (a row's icon action, a bulk action
  in the review queue or My submissions).

**Out** (and where it goes instead):
- **Errors about a form's fields** stay inline next to the field or the form (`Field`'s error, the
  form's `Notice kind="error"`): the person needs them while fixing it.
- **Results the person must read or copy** stay in their dialog: a new access token (shown once), the
  two-factor backup codes, the bulk release summary with its per-item outcomes.
- **Notices about the page's state** stay notices: the instance notice (124), "The scan isn't set
  up", a key that no longer decrypts (136).
- **Notifications that last** (someone approved your submission while you were away): 139.
- **Toasts with buttons** ("Undo"): not now; a toast's only control is close.

## Behaviour

**From the person's side.** They save a draft: "Draft saved" appears at the bottom right for five
seconds and goes. They approve three submissions from the queue: "Approved 3 submissions". A bulk
release that fails on one item shows the dialog's summary as now, plus an error toast that stays
until closed. On a phone the toast sits above the draft editor's bar.

**For the code.**
- `components/ui/Toaster.tsx` (the region and the store), `components/ui/toast.ts` (`useToast`),
  `components/ui/FlashToast.tsx`, `server/http/flash-toast.ts` (`flashToast`).
- The store is a small React context in the root layout; no global singleton (hot reload,
  `docs/knowledge/hot-reload-singletons.md`).
- The flash cookie's key must be one of a typed list of message keys (`FlashKey`), so a cookie a
  person edits can only choose among our own messages; parameters are rendered as plain text through
  next-intl, never as HTML, and anything that doesn't parse is ignored.
- `BottomBar` publishes its height in a CSS custom property (`--bottom-bar-height`) the region
  reads, so the two never overlap, including while the bar follows the on-screen keyboard.

## Edge cases

- **Two actions at once** (two rows approved quickly): two toasts, newest last.
- **The same message twice in a row** (Save pressed twice): one toast, its timer restarted.
- **JavaScript off:** the redirect still lands; the flash cookie expires unread; nothing breaks.
- **A flash cookie for a page that fails to render** (an error page): read and dropped by the next
  page that has the region; at worst shown once, late. It expires after 30 seconds.
- **A dialog open over the page:** the region stays above the dialog's backdrop on wider screens; on
  phones, where dialogs are full screen (067), it sits above the dialog's footer.
- **Very long text** (an item name): wraps; a toast is at most 24rem wide from `sm` up.

## Data

None: no table, no setting. The flash cookie holds `{"k":"<FlashKey>","p":{…}}`, at most 1 KiB.

## Documentation

- None on the website: a toast says what happened, and needs no topic. The styleguide
  (`/styleguide`) gets a Toasts section with each kind, as a reference for later features.
- `docs/knowledge/toasts.md`: when to use a toast, a notice or a dialog (the rules in Scope), and how
  to flash one after a redirect.

## Acceptance criteria

- [ ] One toast region on every page, at the bottom right from `sm` and across the bottom below it,
  above a `BottomBar` and the safe area; tested on the desktop, phone and tablet projects.
- [ ] `ok` and `info` go after 5 seconds, pausing on hover, focus and a hidden tab; `warning` and
  `error` stay until closed; each has a labelled close button with a 44px tap area on touch.
- [ ] Toasts are announced (`status` and `alert` regions present while idle), never take focus, and
  carry a text prefix besides their colour; reduced motion turns off the slide.
- [ ] Only tokens from `tones.ts` and the design system; no shadows (the styleguide's check).
- [ ] `flashToast` after a redirect shows the message once, in the reader's language; an edited
  cookie with an unknown key or bad parameters shows nothing.
- [ ] Every success `Notice` that only confirms an action, and every error of an action with no
  form, is a toast; field and form errors, one-time secrets and the bulk release summary are not.
- [ ] Every new text is a message in English, Portuguese and French.
- [ ] `docs/knowledge/toasts.md` and the styleguide section exist.

## Decisions

1. **Toasts at the bottom right** (owner, 2026-10-29).
2. **Across the bottom on phones, above the bottom bar** (Claude, from 067's rules): the bottom right
   corner of a phone is where `BottomBar` puts Submit and Approve.
3. **Errors and warnings stay until closed** (Claude): an error that goes by itself may never be read.
4. **Our own component, not a library** (Claude): what's needed is small (a store, a region, a timer),
   the common libraries draw shadows and motion the design system doesn't have, and it adds nothing
   to check under the dependency policy. The owner may prefer Sonner (MIT); see Open questions.
5. **The flash cookie carries a message key, never text** (Claude): the text is the reader's
   language, and a cookie can't put words of its own on the screen.

## Open questions

- Sonner (MIT) instead of our own component? It would save the store and the timers, at the cost of
  restyling it to flat and checking it under the policy.
- Should a toast offer "View" when the result has a page (the released version)? Left out for now.
