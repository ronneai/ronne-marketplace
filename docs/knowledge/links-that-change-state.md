# Links that change something: a plain `<a>`, never `Link`

A few things in the app are links that change state on the server, so they work without
JavaScript: the workspace switcher's choices and Show all go to `/current-workspace`, which sets or
clears a cookie and redirects back (120). Write those as a plain `<a href>`, not Next's `Link`.

## Why

- **`Link` prefetches.** In a production build, a `Link` in view is fetched ahead of a click. For a
  route that sets a cookie, rendering the list would set it, for every choice in it.
- **`Link` navigates on the client.** It fetches the next page's server components and keeps the
  layouts that stay mounted. The redirect lands on the same page, so the (app) layout isn't fetched
  again and the shell (here, the switcher) still shows the old state. A Menu sheet that closes on a
  change of page doesn't close either, since the path didn't change.

120's end-to-end tests failed on exactly this until the choices became `<a>`: the cookie was set,
but the sidebar still said All workspaces.

## How to apply

- A link to a route handler that sets a cookie or changes data: `<a href>`, with a full page load.
- Prefer a form with `POST` (a server action) when the change matters; a GET link is fine for a
  display preference, as here.
- Navigation that changes nothing stays a `Link`.
