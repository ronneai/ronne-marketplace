# The Caddy proxy image's scan

Between 2026-10-09 and 2026-10-28 the proxy-image scan (`.github/actions/build-image`, the
`caddy` image `compose.yaml` pins) failed four times on new high CVEs, and each time took an
exception (E-7 to E-10 in [`dependencies.md`](../policies/dependencies.md) §5). None of them was
a Caddy bug, and none was fixed by waiting a week. This note says why, and what to do if it keeps
happening.

**2026-11-18:** Caddy 2.11.9 (Go 1.27.3, `x/net` 0.60.0, `go-jose` 4.1.6) ended E-7 to E-10, and
HTTP/2 is back on. It brought one new finding, CVE-2026-78661 in `x/net/html`, which only
smallstep's command-line help imports (`go mod why golang.org/x/net/html`), so it became E-12 until
a Caddy release with `x/net` 0.62.0.

## Why it keeps failing

The seven CVEs come from two places, and neither is Caddy's own code:

- **The Go toolchain and Go modules the binary is built with** (E-7, E-8, E-10): Go 1.26.8, then
  `golang.org/x/net` and `go-jose`. Go publishes fixes every few weeks; the Caddy project releases
  when it chooses (2.11.7 on 2026-10-03, nothing since; caddyserver/caddy#8282 asks for a
  2.11.8). Docker Hub's rebuilds of the same tag keep the same binary.
- **Alpine packages in the official image** (E-9): `brotli-libs` and `curl`, there because the
  image's Dockerfile installs `curl`. The Caddy binary (built with `CGO_ENABLED=0`) never loads
  them.

Any proxy written in Go (Traefik too) has the first; any image built on Alpine or Debian (nginx
and Apache httpd too) has the second. So switching servers doesn't help. Before deciding that,
the options were compared (owner, 2026-10-28), all licensed as the policy allows:

| | License | ACME built in | Own authority (`RONNE_TLS=internal`) | Cost |
|---|---|---|---|---|
| Caddy (kept) | Apache-2.0 | yes | yes | none |
| nginx | BSD-2 | only with the separate `ngx_http_acme_module` (Apache-2.0), not in the official image | no | rewrite 080 and 083; a native install needs nginx with the module |
| Apache httpd + `mod_md` | Apache-2.0 | yes | no | rewrite 080 and 083; heavier configuration |
| Traefik | MIT | yes | no (only an outside one, such as step-ca) | Go, so the same CVE timing |
| HAProxy | GPL-2.0 | — | — | not allowed |

## Before taking an exception

Check what the CVE needs and whether Caddy as we run it reaches that code: the Caddyfile is
`packages/server/src/service/caddyfile.ts` (compose.yaml's copy is checked against it). For Go
modules, clone the pinned Caddy tag and ask Go who imports the package:

```sh
git clone --depth 1 --branch v2.11.7 https://github.com/caddyserver/caddy.git caddy-src
cd caddy-src
go mod why -m github.com/go-jose/go-jose/v4
go list -deps -f '{{.ImportPath}} {{join .Imports " "}}' ./modules/caddytls \
  | awk '{for(i=2;i<=NF;i++) if($i=="github.com/go-jose/go-jose/v4") print $1}'
```

Put the reasoning in the exception's row, move every Caddy line to one review date so one review
covers them all, and say on the row what image ends it.

## When Caddy as we run it does reach the code (2026-11-18, E-15)

CVE-2026-97054 (Go's `net/http`, fixed in Go 1.27.4, no Caddy release with it) crashes an HTTP/1
server that uses `MaxBytesReader`, and our `request_body { max_size 28MiB }` was exactly that, in
front of `reverse_proxy`. Before reaching for the plan below, take the vulnerable feature off the
request path with one that does the same job another way, and keep the exception dated:

- **Find what Caddy calls the vulnerable code from.** `grep -rn` the symbol in the pinned tag's
  source (here `MaxBytesReader`: `request_body` and the admin API only).
- **Check what removing it exposes before removing it.** The app's own body limits looked enough
  (`proxy.ts`, server actions, `read-json.ts`), but `proxy.ts` only checks a declared
  `Content-Length`, and Better Auth's routes and SCIM read a chunked body to the end. The proxy was
  their only cap, so dropping it would have let anyone send an endless body to sign-in.
- **The replacement here:** matchers. A POST, PUT or PATCH with no `Content-Length` gets 411, and
  one declaring more than 28 MiB gets 413 (`caddyfile.ts`). Go's server enforces the declared
  length over HTTP/1.1 and HTTP/2, so a body can't send more than it declared. Tried against the
  pinned image over HTTP/1.1 and HTTP/2 before changing anything, and `compose-probe.sh` checks it
  through the real stack. A CEL `int()` of an empty header is an error, so guard it with
  `.matches("^[0-9]+$") &&`.

## The plan if it keeps happening: build the proxy image ourselves

Not started; the owner kept the official image (2026-10-28). It would be its own feature, since it
adds an image and changes 080.

- **What:** a `ronneai/marketplace-proxy` image (name to decide), built from Caddy's source at a
  released tag with the current Go release and the fixed modules (`go get` the patched version, as
  4.1.6 for go-jose), on a minimal base with no Alpine packages (for example distroless `static`,
  Apache-2.0). `compose.yaml` pins it by digest instead of `caddy:*`.
- **What it fixes:** the Go and module CVEs as soon as a fix is past the 3-day cooldown, without
  waiting for a Caddy release, and the base-image CVEs by having no packages. Built on 2026-10-28,
  it would have cleared all seven.
- **What stays:** the Caddyfile, `RONNE_TLS`, the Documentation, and the native install, where
  people use their own `caddy` (083).
- **What it costs:** one more image to build, scan, sign in for and publish (the release workflow
  and `docker-hub-pulls.md`), Dependabot entries for Go, Caddy and the base, and the build's own
  checks (the binary's version, `caddy list-modules`, the proxy's end-to-end run). A `go get` past
  what Caddy released is a dependency we chose, so it follows the policy like any other.
- **When to do it:** when the exceptions keep piling up faster than Caddy releases, or a CVE that
  Caddy as we run it does reach has no Caddy release to move to.
