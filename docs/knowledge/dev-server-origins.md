# Opening `pnpm dev` from another address

**A page that loads but where nothing responds is the dev server refusing the address.** Next.js's
dev server gives its scripts and its hot-reload socket only to `localhost` and the hostname it
started with. Opened from the machine's network address (or a tunnel, or another machine), the HTML
arrives but never hydrates: buttons, dialogs and helpers do nothing, and the browser's console
shows the `/_next/hmr` socket failing. The `pnpm dev` terminal says "Blocked cross-origin request".
Builds, the Docker image and `rmk-server` don't have this.

- List the extra hostnames in `DEV_ORIGINS` in `apps/web/.env.local` (comma-separated, no scheme or
  port, e.g. `DEV_ORIGINS=<host>`), then restart `pnpm dev`; it reads the config only at start.
- It lives in `next.config.ts` (`allowedDevOrigins`). A branch without that line loses it: if it
  stops working after a branch switch, check the line is there.
- To check without a browser:
  `curl -si -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: <any base64>' -H 'Origin: http://<host>:3000' http://<host>:3000/_next/hmr`
  answers `101 Switching Protocols` when the address is allowed.
