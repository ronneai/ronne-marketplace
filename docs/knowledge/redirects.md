# Redirects from route handlers

**Send a path, never an address built from `request.url`.** Next.js's standalone server (the
Docker image and `rmk-server`) fills `request.url` in a route handler from the address it listens
on, not from the one the browser used. With `HOSTNAME=0.0.0.0` (the Docker image's), the workspace
switch and the language switch redirected people to `http://0.0.0.0:3000/…` from any IP or domain.
`next dev` and the unit tests never show it: there `request.url` has the real host.

- Use `redirectToPath(path)` (`apps/web/src/server/http/redirect-path.ts`): a 303 with a relative
  `Location`, which the browser resolves against its own address. The path must already be safe
  (`safeBackPath`, `backTo`, `signInUrl`).
- `NextResponse.redirect(new URL(path, request.url))` is the pattern to avoid. In `proxy.ts` it
  happens to come out relative (Next.js strips the origin of a same-origin middleware redirect), but
  don't rely on that elsewhere.
- An absolute URL that must leave the page (an identity provider's callback, a feed address) comes
  from the instance's configured base URL, as `sso.ts` does, never from the request.
- To check by hand: `NEXT_OUTPUT=standalone pnpm --filter "@ronneai/web..." build`, then
  `HOSTNAME=0.0.0.0 PORT=<free port> node apps/web/.next/standalone/apps/web/server.js` and
  `curl -sD - -o /dev/null -H 'Host: ronne.example.com' 'http://127.0.0.1:<port>/language?set=fr&next=%2Fcatalogue'`:
  the `location` must be `/catalogue`.
