# Debian's security fixes and the image build cache

Both images run `apt-get upgrade` on top of their base (`Dockerfile`, and
`scripts/skill-scanner/Dockerfile` since 2026-11-18), so a fix Debian publishes before the Node or
Python image is rebuilt with it still gets in. **The build cache can undo that.** The image job
reads GitHub's build cache (`cache-from: type=gha` in `.github/actions/build-image/action.yml`), and
the `apt-get upgrade` layer only changes when the base digest or that `RUN` line changes. Until
then every build reuses the layer from the first time it ran, with the packages of that day.

## What happened (2026-11-18)

From 2026-11-16 every pull request and nightly run failed the image scan on `apt`
(CVE-2026-109518) and `zlib1g` (CVE-2026-76844, CVE-2026-85091). Trivy listed the fixed versions,
and `trixie-security` already had them (`apt` 3.0.4, `zlib` `+deb13u1`; `qa.debian.org/madison.php`
shows each suite), yet the builds kept `apt` 3.0.3: the cached layer predated the fix. Moving
`node:24-trixie-slim` to a newer digest rebuilt the layer, and the fixes came in.

## What to do

When Trivy reports a Debian package whose fixed version is already in the `-security` suite:

1. Check the suite (`qa.debian.org/madison.php?package=<source>&s=trixie,trixie-security`).
2. Move the base image to its newest digest that is past the 3-day cooldown (Dependabot's pull
   request for the base, or Docker Hub's `tag_last_pushed`). That changes the layer's parent, so
   it's built again.
3. Check locally before pushing: `docker build --target base -t check .`, then
   `docker run --rm --entrypoint sh check -c 'dpkg-query -W <package>'` and the same Trivy command
   as the job. The base stage of `Dockerfile` still has npm, whose bundled packages Trivy also
   reports; the runtime stage deletes npm, so those don't count.

The scanner image is built without the cache (`scanner-probe.sh` runs a plain `docker build`), so
there a new digest or the `apt-get upgrade` line is enough.
