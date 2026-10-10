# Releasing Ronne AI Marketplace

For the owner, who approves every release. One tag `vX.Y.Z` publishes everything of a version:
the four npm packages (034, 082), the Docker image (035), and a GitHub release with the install
scripts (081) and the six self-contained bundles (084). The workflow is
[`.github/workflows/release.yml`](../../.github/workflows/release.yml); nothing in it publishes
until you approve its "npm" environment.

## Checklist

**Before the version:**

- [ ] `main` is green, and the week's Dependabot pull requests are merged or closed.
- [ ] Last night's **Nightly** on `main` passed (Actions › Nightly; run it by hand if `main` moved
      since). Pull requests skip the server package, the install scripts and, unless they change
      them, the image ([test-runs.md](../knowledge/test-runs.md)): this is where they last ran.
- [ ] The bundles' Node.js is current. The bundles take the newest Node.js 24 at build time from
      nodejs.org (Dependabot can't see it). Compare the newest `v24.x.y` in
      [nodejs.org/dist/index.json](https://nodejs.org/dist/index.json) with the one the last pull
      request's *Bundle* jobs printed ("Node.js 24.x.y: … (matches SHASUMS256.txt)"). If a Node.js
      security release is announced for the coming days, wait for it.
- [ ] The Caddy pin in `compose.yaml` (and the CI's Caddy download) has no open policy exception
      past its date (`docs/policies/dependencies.md` §5).

**The version:**

- [ ] A new version: a tag whose GitHub release already exists only re-runs the npm and image steps
      (the release itself is left as it is). The first with bundles comes after 0.2.0.

- [ ] `pnpm release:version X.Y.Z` sets the version of `@ronneai/core`, `@ronneai/rmk`,
      `@ronneai/mcp`, `@ronneai/marketplace` and the web app. Merge it through a pull request.

**A dry run, from `main`:**

- [ ] Actions › Release › Run workflow, from `main`, tag `vX.Y.Z`, *dry run* checked. Approve the
      "npm" environment when asked.
- [ ] It passes, and its log shows:
  - [ ] *Check, pack and publish*: every check, `npm publish --dry-run` for each package not yet
        on npm;
  - [ ] *Image (amd64)* and *(arm64)*: built, run and scanned;
  - [ ] *Bundle* × 6 (linux, darwin and win32, each x64 and arm64): the Node.js version above, its
        SHA-256 matching `SHASUMS256.txt`, "it holds only Node.js, the package and its
        dependencies…", and "runs with its own Node.js, none on PATH". Their archives are the
        run's `bundle-*` artifacts.
  - [ ] *server-checks*, *install-scripts*, *database* and *e2e*: the server installed on Linux,
        macOS and Windows on Node 22 and 24 and run as a service on each, both install scripts,
        every database test on PostgreSQL, MySQL and MariaDB, and the end-to-end tests. The
        GitHub release waits for them.

**The release:**

- [ ] `git tag vX.Y.Z` on the merged commit, then `git push origin vX.Y.Z`. Approve the "npm"
      environment.
- [ ] The packages are on npm with provenance, the image is tagged on Docker Hub, and the GitHub
      release has the four npm tarballs, `install.sh`, `install.ps1`, the six `rmk-server-X.Y.Z-*`
      archives, the four Linux packages (`.deb` and `.rpm`, amd64 and arm64) and `checksums.txt`. Its notes name the bundles' Node.js version and their glibc
      2.34 requirement.
- [ ] A package's first release needs a short-lived `NPM_TOKEN` in the "npm" environment, since a
      trusted publisher can only be set on a package that exists. Link it on npmjs.com to this
      repository, `release.yml` and the "npm" environment, then delete the token.

**If something fails:** each step can be re-run. npm skips a version it already has, the image
refuses a tag that points at other images, and the GitHub release is made only once every bundle
and the image exist. A version on npm can't be replaced, so a broken one needs a new version.
