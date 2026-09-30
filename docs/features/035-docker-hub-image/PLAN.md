# 035 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [ ] **1. One version for four files.** `packages/repo-tools/src/release.js`: a `VERSIONED` map
  (the three `PUBLISHED` packages' `package.json` paths plus `apps/web/package.json`, from the
  repository root) that `withVersion` and `sharedVersion` iterate; `release-check.js` and
  `release-version.js` read it; `PUBLISHED` and `checkPack` stay as they are (the web app isn't
  an npm package). Tests: the `web` text in the fixtures, the differing-versions message, a missing
  `apps/web/package.json`. Then `pnpm release:version 0.1.0`, since `apps/web` is at `0.0.0` and
  `release.test.js` runs the check against the real files.
  *Done when:* `pnpm test` passes and `node packages/repo-tools/src/release-check.js v0.1.0` prints `0.1.0`.

- [ ] **2. The shared composite action.** `.github/actions/build-image/action.yml` with inputs
  `arch`, `tag` (default `ronne-web:ci`) and `cache-to` (default empty): set up Buildx, build and
  load with `cache-from` scope `image-<arch>`, the probe loop, the Trivy scan (its pinned digest
  now lives in one place). `image.yml`'s build job becomes checkout plus the action, passing
  `cache-to` only on pushes to `main`; the `changes` gate, the matrix and the required-check job
  don't change. Add the action's folder to Dependabot's `github-actions` entry.
  *Done when:* the pull request's `Docker image (build, run, scan)` check passes as before.

- [ ] **3. The publish jobs in `release.yml`.** `release` exports `outputs.version`; the `image`
  matrix job (environment `dockerhub`) uses the action, then `docker/metadata-action` (tags with
  `value=v<version>`, the `{{major}}` tag disabled for `0.`, `latest` from `flavor`), logs in,
  pushes by digest (`outputs: type=image,name=docker.io/ronneai/marketplace,push-by-digest=true,name-canonical=true,push=true`,
  `provenance: mode=max`, `sbom: true`, labels and annotations), checks the pushed layers against
  the loaded image, and uploads the digest (`retention-days: 1`, `overwrite: true`). The
  `manifest` job downloads the digests, runs metadata-action with
  `DOCKER_METADATA_ANNOTATIONS_LEVELS=index`, logs in, compares the existing tag's child manifests
  with this run's (skip when equal, fail when different), and runs `docker buildx imagetools
  create` with the tags and annotations passed as array arguments (the description holds spaces).
  The GitHub release moves into a last job that needs `manifest`. Every push-related step is
  skipped on a dry run; `manifest` and the release are skipped at job level. New actions pinned by
  SHA with version comments: `docker/login-action`, `docker/metadata-action`,
  `actions/upload-artifact`, `actions/download-artifact`. The header comment describes the image.
  *Done when:* a dry run dispatched from `main` with the current tag builds, runs and scans both
  architectures and pushes nothing (checked on Docker Hub).

- [ ] **4. `compose.yaml` and `compose.build.yaml`.** `web` loses `build:` and gets
  `image: ${RONNE_IMAGE:-ronneai/marketplace:latest}`; the header explains pull, upgrade, pin and
  the override. `compose.build.yaml` adds `build: .` and `image: ronne-web:local`. Dependabot's
  `docker-compose` entry ignores `ronneai/marketplace` (our own output).
  *Done when:* `docker compose up -d` from a folder with only `compose.yaml` and, from a checkout,
  `docker compose -f compose.yaml -f compose.build.yaml up -d --build` both give a working
  instance (recorded in Notes). Until the first release exists, the first check uses a locally
  pushed tag or waits for task 6.

- [ ] **5. Docs.** The README's "With Docker" section; MVP §5 and the §15 Docker row; 005's "Out"
  line; 034's spec (four files, release after the image); dependency policy §3 "Publishing".
  *Done when:* the README steps work as written from an empty folder.

- [ ] **6. Owner setup and the first release.** The Docker Hub checklist in Notes, the `dockerhub`
  environment, the dry run, then the next `vX.Y.Z` tag.
  *Done when:* Docker Hub shows the version's tags for both platforms with attestations, and every
  acceptance criterion in the spec is ticked.

## Notes

**Docker-side setup (owner, once).** Written 2026-09-29 from Docker's docs of that day; menu
names may move.

1. **Docker ID `ronneai`** at hub.docker.com (the free Personal plan; the name is free today).
   Account settings → Security: turn on two-factor authentication. Publishing from another Docker
   ID instead changes the image name to `<id>/marketplace` everywhere, so decide before step 2.
2. **Repository `marketplace`**, Public. Description: "Ronne AI Marketplace: self-hosted, curated
   registry of AI capabilities for AI coding tools". Overview: the README's Docker section and a
   link to `https://github.com/ronneai/ronne-marketplace`. Category: developer tools.
3. **Access token.** Account settings → Personal access tokens → Generate new token: description
   `github-actions release`, permissions Read and Write (no Delete), an expiry of at most a year
   (the date can't be changed later; note it for rotation). Copy it once.
4. **GitHub environment `dockerhub`.** Settings → Environments → New environment: no required
   reviewers; Deployment branches and tags → Selected → the tag pattern `v*` and the branch
   `main`. Secret `DOCKERHUB_TOKEN` (the token), variable `DOCKERHUB_USERNAME` = `ronneai`.
5. **Dry run.** Actions → Release → Run workflow, from `main`, with the current tag and "dry run"
   on. Both `Image (…)` jobs must pass; nothing appears on Docker Hub.
6. **First release.** Push the next `vX.Y.Z` tag, approve the `npm` environment, and check the
   repository on Docker Hub: the tags from the spec's table, both platforms, attestations.
7. **After the first release.** Repository → Settings → Immutable tags: on, with a rule that
   matches exact versions only, `^\d+\.\d+\.\d+(-.+)?$`, so `latest`, `X.Y` and `X` stay movable.
   (Open question 2.)
8. **Docker-Sponsored Open Source.** Apply at
   https://www.docker.com/community/open-source/application/ (needs the Docker Hub namespace, the
   repository link and the licence). It gives unlimited pulls for the image, a verified badge and
   a free Team subscription for a year, renewable. On approval: convert the Docker ID into an
   organisation (permanent; needs a second Docker ID as its owner; repository names don't change),
   Docker Home → the organisation → OIDC connections → Create, with a ruleset for
   `repo:ronneai/ronne-marketplace:ref:refs/tags/v*`; put the connection ID in the workflow's
   login steps (`DOCKERHUB_OIDC_CONNECTIONID`, `id-token: write`, `username` = the organisation);
   delete the `DOCKERHUB_TOKEN` secret and revoke the token.

**Facts the design rests on** (checked 2026-09-29): Docker Hub's OpenID Connect login for GitHub
Actions (`docker/login-action` 4.5 or later) is only offered to Team, Business and Hardened Images
subscriptions and to the sponsored open-source programme, so a free account uses a token. Creating
an organisation on Docker Hub requires choosing a paid plan. Anonymous pulls are limited to 100 per
six hours per address, 200 for a free account that's logged in, unlimited on paid plans and for
sponsored images. `docker/metadata-action` gives pre-releases only their exact version tag and
needs the `{{major}}` tag disabled for major 0. Docker's `github-builder` reusable workflow was
considered and set aside: it pushes straight after building, with no place to run the container
and scan it first, and its registry secret can't sit behind a job-level environment.
