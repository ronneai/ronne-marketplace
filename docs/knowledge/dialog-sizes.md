# Dialog sizes

Every dialog (`Dialog` in `components/ui`) takes one size from one scale, so the app's dialogs look
related (owner, 2026-10-20, feature 123). Below `sm` they all fill the screen, so a size is for
laptops and up.

| `size` | Width | Use it for | Examples |
|---|---|---|---|
| `small` | 24rem (384px) | a short confirmation, one question | (none yet: use it for a yes/no) |
| `medium` | 32rem (512px), **the default** | an ordinary form: a few fields | Create user, Change role, Reset password |
| `large` | 40rem (640px) | lists of long names, rows with two fields | Move scope, Workspaces of a user |
| `xlarge` | 56rem (896px) | content in two columns, or a long explanation that would scroll in one | Erase user |
| `side` | 20rem sheet | the phone menu; a sheet from the right, not a size on the scale | Menu |

- **Pick the smallest size that fits the content without scrolling on a laptop screen**
  (1280x720). If a dialog scrolls at `medium`, first ask whether it can be shorter, then
  whether it can use two columns at `xlarge` (`md:grid-cols-2`).
- **`fixedHeight`** is separate from the width: it makes a frame up to 45rem tall, for a dialog
  whose long list scrolls inside while the title and buttons stay in view (Bulk release, Bulk
  approve). It works with any width.
- A dialog with no `size` is `medium`. Don't set widths with classes on a dialog's content to make it
  wider: choose a size.
- **The buttons' bar** (`DialogActions`) sticks to the bottom and has a top margin: the content
  never sits against its border (32px in a form with `gap-4`). Use it in every dialog that has
  buttons, last in the body. It marks itself `data-dialog-actions`, and the body drops its own bottom
  padding when it holds one, so the bar sits flush at the bottom.
- **Why the bar has no negative bottom margin:** it used to have `-mb-4`, to reach the body's
  padding. A `position: sticky` box that sticks out of its container is pushed back inside it, so
  the bar sat 16px higher than its place and ate the form's gap: the content was against the
  border. Don't give a sticky element a negative margin on the side it sticks to.
- **Helpers in a dialog** go beside the text, not in a `<p>`
  ([help-tips-and-paragraphs.md](./help-tips-and-paragraphs.md)): `help-not-in-paragraph.test.ts`
  reads every source file for it, because static-markup tests and production builds don't
  report invalid nesting.
