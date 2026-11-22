# 035 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. One version for four files.** `packages/repo-tools/src/release.js`: a `VERSIONED` map
  (the three `PUBLISHED` packages' `package.json` paths plus `apps/web/package.json`, from the
  repository root) that `withVersion` and `sharedVersion` iterate; `release-check.js` and
  `release-version.js` read it; `PUBLISHED` and `checkPack` stay as they are (the web app isn't
  an npm package). Tests: the `web` text in the fixtures, the differing-versions message, a missing
  `apps/web/package.json`. Then `pnpm release:version 0.1.0`, since `apps/web` is at `0.0.0` and
  `release.test.js` runs the check against the real files.
  *Done when:* `pnpm test` passes and `node packages/repo-tools/src/release-check.js v0.1.0` prints `0.1.0`.

- [x] **2. The shared composite action.** `.github/actions/build-image/action.yml` with inputs
  `arch`, `tag` (default `ronne-web:ci`) and `cache-to` (default empty): set up Buildx, build and
  load with `cache-from` scope `image-<arch>`, the probe loop, the Trivy scan (its pinned digest
  now lives in one place). `image.yml`'s build job becomes checkout plus the action, passing
  `cache-to` only on pushes to `main`; the `changes` gate, the matrix and the required-check job
  don't change. Add the action's folder to Dependabot's `github-actions` entry.
  *Done when:* the pull request's `Docker image (build, run, scan)` check passes as before.

- [x] **3. The publish jobs in `release.yml`.** `release` exports `outputs.version`; the `image`
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

- [x] **4. `compose.yaml` and `compose.build.yaml`.** `web` loses `build:` and gets
  `image: ${RONNE_IMAGE:-ronneai/marketplace:latest}`; the header explains pull, upgrade, pin and
  the override. `compose.build.yaml` adds `build: .` and `image: ronne-web:local`. Dependabot's
  `docker-compose` entry ignores `ronneai/marketplace` (our own output).
  *Done when:* `docker compose up -d` from a folder with only `compose.yaml` and, from a checkout,
  `docker compose -f compose.yaml -f compose.build.yaml up -d --build` both give a working
  instance (recorded in Notes). Until the first release exists, the first check uses a locally
  pushed tag or waits for task 6.

- [x] **5. Docs.** The README's "With Docker" section; MVP §5 and the §15 Docker row; 005's "Out"
  line; 034's spec (four files, release after the image); dependency policy §3 "Publishing".
  *Done when:* the README steps work as written from an empty folder.

- [x] **6. Owner setup and the first release.** The Docker Hub checklist in Notes, the `dockerhub`
  environment, the dry run, then the next `vX.Y.Z` tag.
  *Done when:* Docker Hub shows the version's tags for both platforms with attestations, and every
  acceptance criterion in the spec is ticked.

## Notes

**Progress (2026-09-29).** Tasks 1–5 are built in one change; tasks 2 and 3's "done when" (the
pull request's image check, and the dry run from `main`) are checked once it's on GitHub, and
task 6 is the owner's.

- Task 1: `VERSIONED` in `release.js` maps a key to a path from the repository root (`core`,
  `cli`, `mcp` under `packages/`, and `web`); `PUBLISHED` is untouched. `pnpm release:version
  0.1.0` moved `apps/web` from `0.0.0`; the tag check and its test read the four files.
- Task 2: the composite action removes its container after the probe, so the release job's push
  runs on a clean daemon; nothing else moved. Dependabot's `github-actions` entry lists the
  action's folder as a second directory.
- Task 3: the guard reads the pushed image's config with `imagetools inspect --format '{{json
  .Image}}'`, which is one config for a one-platform index (the attestation manifest isn't in it)
  and a map by platform otherwise; both shapes are handled. The manifest job compares the child
  manifests (image plus attestation, per architecture) of the existing version tag with this
  run's, since `imagetools create` flattens the per-architecture indexes into one list. The
  guard, the create (tags and index annotations) and the re-run and mismatch paths were run
  locally against a `registry:2` container with a tiny image pushed by digest with attestations.
  `gh release create` takes the notes from `--notes` prepended to `--generate-notes`. The release
  job uploads the npm tarballs as an artifact for the last job.
- Task 4: from a folder holding only `compose.yaml`, with `RONNE_IMAGE=ronne-web:local` (no
  release on Docker Hub yet), `docker compose up -d` answered `503 setup_required`, `setup --yes`
  ran in the container, and after `restart web` `/api/health` answered `200`. From the checkout,
  `docker compose -f compose.yaml -f compose.build.yaml build web` produced `ronne-web:local`.
  The same check against the Docker Hub image is task 6's.
- Task 5: the README's Docker section starts from an empty folder and a `curl` of `compose.yaml`
  from `main`.
- Tasks 2, 3 and 6 (2026-09-30): the pull request's `Docker image (build, run, scan)` check passed
  through the composite action. The owner created the Docker ID `ronneai` (personal, free plan;
  a second Docker ID, since Docker Hub allows one per email), the public repository, the token
  and the `dockerhub` environment. The dry run from `main` (run 36661513251) built, ran and
  scanned both architectures and skipped every push step. `v0.1.0` couldn't publish an image
  (that tag holds the older workflow), so the first image release was `0.1.1` (run 36662238616):
  npm, both images, the manifest and the GitHub release, in that order. Checked afterwards:
  tags `0.1.1`, `0.1` and `latest` share one index with `linux/amd64`, `linux/arm64` and an
  attestation manifest each (SLSA provenance, SPDX 2.3 SBOM with 163 packages); no `0` tag; the
  index annotations carry source, version and licence; the guard's scanned and pushed layers
  matched. From an empty folder with `compose.yaml` fetched from `main`, `docker compose up -d`
  pulled the image and answered `503 setup_required`, setup ran, and after a restart `/api/health`
  answered `200`. Two things found and fixed after the release: the index's description
  annotation was empty (metadata-action doesn't copy custom labels to annotations, and the GitHub
  repository description is blank), and the GitHub release step would fail on a re-run because
  the release exists. Still to check when they first happen: a pre-release's tags, and a
  re-run of a finished release end to end.

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
