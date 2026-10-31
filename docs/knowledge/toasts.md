# Toasts

Feature 138. A toast says the result of an action in a few words, bottom right (across the bottom
on a phone, above the action bar), and goes by itself. This note says when to use one, how, and the
traps found while building them.

## When a toast, a notice or a dialog

| The result is… | Use | Why |
|---|---|---|
| A success that only confirms ("Draft saved", "Token revoked", "Created @team") | **A toast** | Nothing to read twice, nothing to copy |
| An error of an action with no form (a row's icon action, a bulk action, a version change) | **An error toast**, which stays until closed | There is no field to put it next to |
| An error about a form's fields, or the form as a whole | **Inline**: `FieldError`, or the form's `Notice kind="error"` | The person needs it in view while they fix it |
| Something to read or copy: a new access token, a one-time password, the two-factor backup codes, the bulk release or approve summary with a line for each item | **Stays in its dialog** | A toast goes after 5 seconds |
| The state of the page ("The scan isn't set up", the instance notice, a key that no longer decrypts) | **A `Notice`** | It is true until someone fixes it |
| Something that lasts after the person leaves (someone approved your submission) | **A notification** (139) | A toast is for the next five seconds |
| A thank-you page that replaces its form, or a row whose button becomes its result ("Cancelled.", an approved item move) | **Stays in place** | It is the new state of that piece of the page |
| A single release's result (the version, the tag and the sha256 of the package) | **Stays in its dialog** | It is a result to read and copy |
| The Getting started panel's steps | **Stays in place** | `state.done` there is progress, not a confirmation |
| The error of a button, icon or select in a row, with no form to put it next to (Approve an item move, Cancel a move or a request, a member's role, a queue row's Reject, the favourite star) | **An error toast** | The row keeps its control; the error stays until closed |
| The refusal of Propose change (it can carry an "Ask to join" link and a Help) | **Inline, under its button** | A toast has no buttons or links (SPEC 138, Out) |
| The error of a list inside a dialog (a shelf's pins, the Pin dialog's own refusals) | **Inline, in the dialog** | The dialog is the place the person is looking at |

A bulk action that has a summary in its dialog also says the count as a toast ("Approved 3
submissions"), and an error toast if some failed.

## Saying it

- **In the browser**, after an action returns: `const toast = useToast(); toast.ok(t("saved"))`, or
  `toast.info`, `toast.warning`, `toast.error`. The text is already in the person's language.
- **From a form's state**: `useToastWhen(state, state.done)` says `state.done` each time the
  action returns (the state is a new object each time, so the same words twice are said twice).
  Pass `onDone` as the fourth argument when the dialog the form is in only confirmed and should
  close: `useToastWhen(state, state.done, "ok", onDone); if (state.done) return null;`. Call it
  before any early return.
- **After a server action that redirects**: `await flashToast("draftDeleted")` before `redirect()`.
  It sets a 30-second cookie holding a message key (`common.flash.<key>`) and parameters, never
  text. Add the key to `FLASH_KEYS` in `src/i18n/flash.ts` and the message in all three languages.
  The root layout reads the cookie on the server, hands a checked flash to the client, which shows
  it once and removes the cookie. Keys and parameters that don't parse are ignored.
- Messages for client toasts are in `common.done` (or the feature's own namespace).

## Traps

- **Only `components/ui/Toaster.tsx` and `toast.tsx` import Sonner** (a lint rule). Everything
  else uses `useToast`, so Sonner can be replaced.
- **A toast over a modal dialog.** A modal `<dialog>` is in the top layer with the page inert; a
  popover opened first stayed under it. While a dialog is open the `Toaster` moves the region into
  it, and back when it closes. On a phone it also clears the dialog's `DialogActions`.
- **Above a bottom bar.** `BottomBar` publishes `--bottom-bar-height`: the distance from its top
  edge to the bottom of the screen, so what is under it (the app's bottom navigation) counts. The
  tablet shows why the bar's own height is not enough.
- **Sonner pauses for the pointer and a hidden tab, not for the keyboard.** The `Toaster` tells it
  focus inside the list is the pointer over it.
- **Sonner has one live region.** Each toast carries its own `role="status"` or `role="alert"`.
- **Without JavaScript** a toast is never shown. A form that must be answered without JavaScript
  (the Notice settings) renders its result in place when the page comes back with it (`initial`),
  and says it as a toast only for a save made with JavaScript.
- **Tests.** Unit tests of timers run in happy-dom with fake timers; move the clock in steps of
  250 ms with React flushed between them, as Sonner's removal after 200 ms starts from an effect.
  End-to-end tests take `toastWith(page, text)` from `e2e/toast.ts`. The styleguide page shows
  each theme's sample twice, so a test that clicks its buttons takes `.first()`.
