# 035 — Publishing the web app's Docker image to Docker Hub

> Milestone: M6 · Depends on: 005, 034 · Design: [MVP §5](../../MVP/MVP.md#5-installation--bootstrap) (install paths), [§15](../../MVP/MVP.md#15-decision-log) (Docker, Packages) · Policy: [`docs/policies/dependencies.md`](../../policies/dependencies.md) §3

## Goal

Anyone can run Ronne with `docker compose up -d` from one file, pulling the image
`ronneai/marketplace` from Docker Hub, instead of cloning the repository and building it. Every
release ships a checked image for `linux/amd64` and `linux/arm64` that carries the same version as
the npm packages, so "Ronne 0.1.0" means one thing everywhere.

This is the step [005](../005-docker/SPEC.md) left out ("publishing images to a registry → at the
first release") and [034](../034-npm-packages/SPEC.md) kept separate.

## Scope

**In:**
- The public Docker Hub repository `ronneai/marketplace` (owner's decision, 2026-09-29: the npm
  scope's name; not the bare `ronne`, which is reserved for another product).
- Publishing from `release.yml` on the same `vX.Y.Z` tag that publishes the npm packages, after
  they succeed: one release, one approval, one version. `pnpm release:version` also sets
  `apps/web`'s version.
- Each architecture built natively, run and probed, scanned with Trivy, then pushed by digest;
  a multi-architecture manifest list tagged `X.Y.Z`, `X.Y`, `X` and `latest`.
- OCI labels and annotations (source, revision, version, licence, description), and BuildKit
  provenance and SBOM attestations on every image.
- The build, probe and scan steps shared with `image.yml` through one composite action, so they
  can't drift.
- A dry run by hand that builds, runs and scans but pushes nothing.
- `compose.yaml` on the published image, with a `compose.build.yaml` override for building from a
  checkout.
- The README, MVP §5 and §15, 005's and 034's specs, and the dependency policy updated.

**Out** (and where it goes instead):
- A mirror on GitHub Container Registry: possible later, as MVP §15 says for npm (Docker Hub is
  the place people look first, and one registry keeps the docs simple).
- An `edge` tag built from `main`: not now (it would double the work on every merge); a feature of
  its own if testers ask for it.
- Signing with cosign: post-MVP, with release signing (MVP §14.2). The attestations above are
  produced by BuildKit and need no keys.
- Kubernetes manifests or a Helm chart: post-MVP, if asked for.
- Docker Hub's automated builds and Docker's `docker/github-builder` reusable workflow: both push
  straight after building, with no way to run the container and scan it in between.

## Behaviour

**The image.** `docker.io/ronneai/marketplace`, built from the root `Dockerfile` (005) for
`linux/amd64` and `linux/arm64`. Each version's tags:

| Version | Tags |
|---|---|
| Stable, `1.4.2` | `1.4.2`, `1.4`, `1`, `latest` |
| Stable in major 0, `0.3.1` | `0.3.1`, `0.3`, `latest` (no `0` tag: a major of 0 promises nothing) |
| Pre-release, `1.0.0-beta.1` | `1.0.0-beta.1` only; `latest` doesn't move |

The version is the release tag's, which [034](../034-npm-packages/SPEC.md)'s check already
matches against the packages' `version`; `apps/web/package.json` joins that check, so the four
`package.json` files always agree (`pnpm release:version` sets all of them). Every image carries
the OCI labels and index annotations `org.opencontainers.image.{source,revision,version,licenses,description,url}`
from `docker/metadata-action`, plus a provenance attestation (`mode=max`) and an SPDX SBOM
attestation made by BuildKit.

**Who can publish.** Only the owner, with the same gates as 034: the `release` job waits for the
owner's approval in the `npm` environment, and a tag ruleset lets only admins create `v*` tags.
Docker Hub's credentials live in a second GitHub environment, `dockerhub` (variable
`DOCKERHUB_USERNAME`, secret `DOCKERHUB_TOKEN`), with no reviewer of its own: its jobs only run
after the npm job succeeded, so the owner's click already happened. The environment allows
deployments from `v*` tags and from `main`; `main` only so a dry run can be dispatched from it.

**The workflow** (`release.yml`, after the existing `release` job, which exports the version):

1. **`image`**, one job per architecture on its own runner (`ubuntu-latest`, `ubuntu-24.04-arm`,
   as `image.yml` does): the composite action builds the image and loads it, runs it until
   `/api/health` answers `setup_required`, and scans it with Trivy (high and critical, fixed only,
   as on every pull request). Only then it logs in to Docker Hub and exports the same build
   (every layer a cache hit in the same builder) with the labels, annotations and attestations,
   pushed **by digest**, untagged. A guard checks the pushed image has the layers of the image
   that was scanned. The digest is uploaded as a workflow artifact.
2. **`manifest`**: downloads both digests, logs in, and checks Docker Hub first. If the version
   tag already lists exactly these images (a re-run), it skips; if it lists other images, it
   fails ("release a new version instead": versions are immutable, as npm's and Ronne's own are).
   Otherwise it creates the manifest list with `docker buildx imagetools create`, applying the
   tags and the index annotations, and prints the result.
3. **The GitHub release** (034's last step) moves after the manifest, so a release on GitHub
   exists only once every artefact of it does.

Layer caches are read from the scopes `image.yml` writes on pushes to `main`; a release doesn't
write them.

**Dry run.** Running the workflow by hand with "dry run" (the default) builds, runs and scans both
architectures and pushes nothing: the login, push, digest and manifest steps are skipped, and so
is the GitHub release. It's dispatched from `main`, since an older tag holds an older workflow.

**Authentication.** A personal access token of the `ronneai` Docker ID (Read & Write, with an
expiry), because Docker Hub's OpenID Connect login for GitHub Actions (July 2026) is only offered
to paid organisations and to the Docker-Sponsored Open Source programme. Once that programme
accepts Ronne, the login step drops the token for a connection ID (`docker/login-action` with
`DOCKERHUB_OIDC_CONNECTIONID` and `id-token: write`); nothing else in the workflow changes. The
login is its own named step in both jobs for that reason.

**Users.** `compose.yaml` names `${RONNE_IMAGE:-ronneai/marketplace:latest}` and has no `build:`,
so `docker compose up -d` pulls the image and a clone isn't needed (the file alone is enough):

- Upgrade: `docker compose pull web && docker compose up -d`; migrations run on start (005).
- Pin a version: `RONNE_IMAGE=ronneai/marketplace:0.1.0` in the environment or a `.env` next to
  the compose file.
- Build from a checkout (contributors): `docker compose -f compose.yaml -f compose.build.yaml up -d --build`.
  The override adds `build: .` and sets `image: ronne-web:local`, so a local build never
  shadows the Docker Hub tag and the next `pull` never overwrites a local build. It isn't named
  `compose.override.yaml`, which Compose would load for everyone.
- Docker Hub limits anonymous pulls (100 per 6 hours per address; 200 when logged in to a free
  account); the README says so, since a busy shared address can hit it.

**Repository settings on Docker Hub** (owner, by hand; there's no action for it without a third
party): public, the description from the root `package.json`, an overview with the README's
Docker section and a link to GitHub, and, after the first release, immutable tags for exact
versions only (a regex rule, so `latest`, `X.Y` and `X` can still move).

## Edge cases

- **The tag doesn't match the versions:** the workflow stops before npm (034), so no image either.
- **The npm job fails:** the image jobs don't run. A re-run finishes both (npm skips versions
  already there; the manifest job skips a tag that already lists these images).
- **Trivy finds a fixable high or critical vulnerability on release day:** the release fails
  before anything is pushed; fix (usually the base image digest) and release again.
- **One architecture fails** (for example the arm64 runner is unavailable): nothing is tagged. The
  other architecture's untagged push stays on Docker Hub, unreferenced and harmless.
- **Re-running more than a day later:** the digest artifacts have expired, so re-run all jobs.
  The new builds have new digests (attestations carry timestamps), so the manifest job finds the
  tag pointing at other images and fails on purpose. Release a new patch version instead.
- **Immutable tags on Docker Hub** are enabled for exact versions: the same deliberate failure, one
  step earlier, at the push. `latest`, `X.Y` and `X` are excluded from the rule, or every release
  after the first would fail.
- **The layer cache is gone** (evicted, or the tag isn't on `main`'s head): a full build, about
  seven minutes per architecture. Still correct.
- **An older `compose.yaml` with `build: .`** (a checkout from before this feature) keeps
  working: nothing in the image changed.
- **The `dockerhub` environment is missing or the token expired:** the image jobs fail at login;
  npm is already published. Fix the environment and re-run the failed jobs.

## Documentation

**None** in the app. The Documentation ([033](../033-in-app-help/SPEC.md)) explains the registry to
the people who use an instance; how to host one lives in the README, and the setup-required screen
already shows the compose command, which doesn't change. What does change:

- **README, "With Docker":** pull instead of clone; upgrade with `pull`; pin with `RONNE_IMAGE`;
  build from a checkout with the override; the pull rate limits.
- **MVP §5** (the Docker install line) and **§15** (the Docker row: published to Docker Hub as
  `ronneai/marketplace`, same version as npm).
- **005's spec** ("Out: publishing → at the first release" now points here) and **034's spec**
  (`release:version` sets four files, and the GitHub release comes after the image).
- **Dependency policy §3, "Publishing":** the image's provenance and SBOM attestations.

## Acceptance criteria

- [ ] A tag `vX.Y.Z` publishes `ronneai/marketplace` for `linux/amd64` and `linux/arm64` with the
  tags in the table, labels, index annotations, and provenance and SBOM attestations
  (`docker buildx imagetools inspect`, `docker inspect`).
- [ ] A pre-release tag publishes only its exact version tag, and `latest` doesn't move.
- [ ] A version in major 0 gets no `0` tag.
- [ ] Both architectures are run, probed and scanned before anything is pushed; the pushed
  image has the scanned image's layers.
- [ ] A dry run from `main` builds, runs and scans both architectures and pushes nothing.
- [ ] Re-running a finished release changes nothing on Docker Hub or npm and ends green.
- [ ] `pnpm release:version` sets `apps/web` too, and the tag check covers it.
- [ ] `image.yml` behaves as before with the shared composite action.
- [ ] From an empty folder holding only `compose.yaml`: `docker compose up -d` answers `503
  setup_required`, setup runs in the container, and after a restart `/api/health` answers 200.
- [ ] From a checkout, the `compose.build.yaml` override builds and runs the local image.
- [ ] The README, MVP §5 and §15, 005's and 034's specs and the dependency policy say what the
  feature does now.

## Open questions

1. **Docker-Sponsored Open Source.** Whether Docker accepts the application (MIT, public source,
   non-commercial). If it does: convert the Docker ID into an organisation, add the OpenID Connect
   connection, and drop the token.
2. **Immutable exact versions on Docker Hub** (recommended: it matches npm's rule and Ronne's own,
   and the manifest job already refuses to move a version) or leave the setting off.
3. **A `0` major tag** on 0.x versions, if the owner prefers `docker pull ronneai/marketplace:0`.
