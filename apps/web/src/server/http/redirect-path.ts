import { NextResponse } from "next/server";

/**
 * A redirect to a path on this site, with a relative `Location` the browser resolves against the
 * address it used. Never build it from `request.url`: Next.js's standalone server (Docker,
 * `rmk-server`) fills that from the address it listens on, so `HOSTNAME=0.0.0.0` sent people to
 * `http://0.0.0.0:3000/…` (docs/knowledge/redirects.md). `path` must already be a safe path.
 */
export const redirectToPath = (path: string, status = 303) =>
  new NextResponse(null, { status, headers: { location: path } });
